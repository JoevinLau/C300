# main.py
import logging
import os
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from ecotransit_scraper import calculate_ecotransit
from models import (
    BatchCalculationRow,
    CalculationDetails,
    ChatResponse,
    CostBreakdown,
    EcoTransitRequest,
    EmissionBreakdown,
    InputData,
    MappingLearnRequest,
    NaicsConfirmRequest,
    NaicsOption,
    OutputData,
)
from service import (
    list_naics_options, 
    compute_emissions, 
    fetch_naics_for_material, 
    save_material_mapping,
    search_naics_mappings,
    suggest_naics_with_llm,
    confirm_naics_mapping,
    get_naics_factor_by_code,
    calculate_batch_emissions,
)
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

API_DIR = Path(__file__).resolve().parent
ROOT_DIR = API_DIR.parent

load_dotenv(ROOT_DIR / ".env")
load_dotenv(API_DIR / ".env", override=True)

AI_KEY_ENV_NAMES = ("AI_KEY", "OPENAI_API_KEY")

def get_ai_key() -> str:
    for env_name in AI_KEY_ENV_NAMES:
        key = os.environ.get(env_name)
        if key and key.strip():
            return key.strip()

    accepted_names = " or ".join(AI_KEY_ENV_NAMES)
    raise HTTPException(
        status_code=500,
        detail=(
            f"{accepted_names} environment variable not set. "
            "Add AI_KEY=your_key_here or OPENAI_API_KEY=your_key_here "
            "to .env in the project root or api/.env, then restart the API server."
        ),
    )

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(Exception)
async def unhandled_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled API error: %s", exc)
    print(f"Unhandled API error: {exc}", flush=True)
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {exc}"},
    )


# ---------- ENDPOINTS ----------

@app.get("/fetch-naics")
def get_naics_by_material(name: str):
    return fetch_naics_for_material(name)


@app.get("/api/naics/search")
async def search_naics(q: str, user_id: str = "default"):
    return search_naics_mappings(q, user_id=user_id)


@app.get("/api/naics/llm-suggest")
async def llm_suggest_naics(material: str):
    return suggest_naics_with_llm(material)


@app.get("/api/naics/factor/{naics_code}")
async def get_naics_factor(naics_code: str):
    return get_naics_factor_by_code(naics_code)


@app.post("/api/naics/confirm")
async def confirm_naics(data: NaicsConfirmRequest):
    return confirm_naics_mapping(
        material_token=data.material_token,
        mapped_naics=data.mapped_naics,
        user_id=data.user_id,
    )


@app.post("/api/calculate/batch")
async def calculate_batch(rows: list[BatchCalculationRow]):
    return calculate_batch_emissions([row.model_dump() for row in rows])


@app.post("/learn-mapping")
def learn_mapping(data: MappingLearnRequest):
    save_material_mapping(data.keyword, data.naics_code, data.description, data.category)
    return {"status": "success"}

@app.get("/naics", response_model=list[NaicsOption])
def get_naics_options():
    return list_naics_options()


@app.post("/calculate", response_model=OutputData)
def calculate_emissions(data: InputData):
    payload = {
        "invoice_id": data.invoice_id,
        "year": data.year,
        "total_amount_sgd": data.total_amount_sgd,
        "sgd_amounts": data.sgd_amounts.model_dump(),
        "naics": data.naics.model_dump(),
    }

    try:
        result = compute_emissions(payload)
    except ValueError as exc:
        logger.exception("Calculation validation failed: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return OutputData(
        invoice_id=data.invoice_id,
        calculation=CalculationDetails(**result["calculation"]),
        costs=CostBreakdown(**result["costs"]),
        emissions=EmissionBreakdown(**result["emissions"]),
    )


@app.post("/method2-chat", response_model=ChatResponse)
def method2_chat(
    message: str = Form(...),
    excel_file: UploadFile | None = File(None),
):
    key = get_ai_key()

    try:
        from openai import OpenAI
    except ImportError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"OpenAI dependency missing: {exc}. Install requirements with `pip install -r requirements.txt`.",
        ) from exc

    try:
        client = OpenAI(api_key=key)
        content = message
        file_description = None

        if excel_file is not None:
            contents = excel_file.file.read()
            if contents:
                file_description = f"Uploaded spreadsheet filename={excel_file.filename} size={len(contents)} bytes"
                content = f"{file_description}\n\n{message}"
            excel_file.file.close()

        resp = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": content}],
            max_tokens=500,
        )
        choice = resp.choices[0] if resp.choices else None
        text = None
        if choice and hasattr(choice, 'message') and choice.message is not None:
            text = choice.message.get('content') if isinstance(choice.message, dict) else getattr(choice.message, 'content', None)
        if not isinstance(text, str):
            raise ValueError("OpenAI API response did not contain a valid text reply.")
    except Exception as exc:
        logger.exception("Method 2 chat failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return ChatResponse(reply=text)


@app.post("/method2-chat-file", response_model=ChatResponse)
def method2_chat_file(
    message: str = Form(...),
    excel_file: UploadFile | None = File(None),
):
    key = get_ai_key()

    file_content_description = ""
    if excel_file is not None:
        try:
            from openpyxl import load_workbook
        except ImportError as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Python dependency openpyxl is missing: {exc}. Install requirements with `pip install -r requirements.txt`.",
            ) from exc

        try:
            workbook = load_workbook(filename=excel_file.file, data_only=True)
            sheet = workbook.active
            rows = []
            for row in sheet.iter_rows(values_only=True):
                rows.append([str(cell) if cell is not None else "" for cell in row])
            excel_file.file.close()
            file_content_description = f"Extracted spreadsheet table with {len(rows)} rows and {len(rows[0]) if rows else 0} columns."
        except Exception as exc:
            logger.exception("Failed to parse Method 2 uploaded Excel file: %s", exc)
            raise HTTPException(status_code=400, detail=f"Failed to parse uploaded Excel file: {exc}") from exc

    try:
        from openai import OpenAI
    except ImportError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"OpenAI dependency missing: {exc}. Install requirements with `pip install -r requirements.txt`.",
        ) from exc

    try:
        client = OpenAI(api_key=key)
        content = message
        if file_content_description:
            content = f"{file_content_description}\n\n{message}"

        resp = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": content}],
            max_tokens=500,
        )
        choice = resp.choices[0] if resp.choices else None
        text = None
        if choice and hasattr(choice, 'message') and choice.message is not None:
            text = choice.message.get('content') if isinstance(choice.message, dict) else getattr(choice.message, 'content', None)
        if not isinstance(text, str):
            raise ValueError("OpenAI API response did not contain a valid text reply.")
    except Exception as exc:
        logger.exception("Method 2 chat file failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return ChatResponse(reply=text)

@app.get("/")
def home():
    return {"message": "API is running!"}


@app.post("/ecotransit")
def ecotransit(data: EcoTransitRequest):
    try:
        result = calculate_ecotransit(
            port_of_loading=data.port_of_loading,
            port_of_discharge=data.port_of_discharge,
            weight_kg=data.weight_kg,
            transport_mode=data.transport_mode,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("EcoTransit scraper failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"EcoTransit scraper failed: {exc}") from exc

    return {
        "transport": {
            "origin": data.origin_country or data.port_of_loading,
            "port_of_loading": data.port_of_loading,
            "port_of_discharge": data.port_of_discharge,
            "weight_kg": data.weight_kg,
            "chosen_mode": data.transport_mode,
            "chosen_emissions_kg": result.get("co2e_kg"),
            "distance_km": result.get("distance_km"),
            "energy_mj": result.get("energy_mj"),
            "source": "EcoTransit World",
            "raw": result,
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)

