from dataclasses import asdict
import json
import logging
import os
import sys
import tempfile
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Ensure repo root is on sys.path so imports work when running `python api/main.py`
API_DIR = Path(__file__).resolve().parent
ROOT_DIR = API_DIR.parent
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from ecotransit_scraper import calculate_ecotransit
from calculator import compute_emissions
from dev_data import MAX_CALCULATION_YEAR, MIN_CALCULATION_YEAR
from calculation.method2_calculations import (
    MachineReferenceDataUnavailable,
    compute_method2,
    list_machine_library,
)
from service import (
    calculate_batch_emissions,
    calculate_ecotransit_transport,
    calculate_local_transport_estimate,
    confirm_naics_mapping,
    fetch_naics_for_material,
    get_naics_factor_by_code,
    list_naics_options,
    save_material_mapping,
    search_naics_mappings,
    suggest_naics_with_llm,
)
from rag_service import (
    EmptyDocumentError,
    RagError,
    RagService,
    SearchResult,
    UnsupportedDocumentError,
)
from db import DatabaseUnavailable, execute_with_retry
from models import (
    BatchCalculationResult,
    BatchCalculationRow,
    CalculationDetails,
    ChatCitation,
    ChatResponse,
    CostBreakdown,
    EcoTransitRequest,
    EmissionBreakdown,
    InputData,
    MappingLearnRequest,
    Method2ChatRequest,
    Method2InputData,
    NaicsConfirmRequest,
    NaicsOption,
    OutputData,
    RagDocument,
    RagUploadResult,
)

logger = logging.getLogger(__name__)

load_dotenv(ROOT_DIR / ".env")
load_dotenv(API_DIR / ".env", override=True)

AI_KEY_ENV_NAMES = ("AI_KEY", "OPENAI_API_KEY")
RAG_CHAT_MODEL = os.getenv("RAG_CHAT_MODEL", "gpt-4.1-mini")
rag_service = RagService()

COUNTRY_ALIASES = {
    "malaysia (peninsular)": "Malaysia",
    "indonesia (java-bali)": "Indonesia",
    "south korea": "South Korea",
    "united states": "United States",
    "usa": "United States",
    "u.s.": "United States",
    "u.s.a.": "United States",
    "uae": "United Arab Emirates",
}

def _normalize_transport_country(value: str | None) -> str:
    cleaned = (value or "").strip()
    if not cleaned:
        return ""
    lowered = cleaned.lower()
    if lowered in COUNTRY_ALIASES:
        return COUNTRY_ALIASES[lowered]
    cleaned = cleaned.split("(")[0].strip()
    for prefix in ("Port of ", "Via Port of "):
        if cleaned.lower().startswith(prefix.lower()):
            cleaned = cleaned[len(prefix):].strip()
    return cleaned


def estimate_transport_response(data: "EcoTransitRequest", reason: str | None = None) -> dict[str, Any]:
    origin = _normalize_transport_country(data.origin_country) or _normalize_transport_country(data.port_of_loading)
    result = calculate_local_transport_estimate(
        port_of_loading=data.port_of_loading,
        port_of_discharge=data.port_of_discharge,
        weight_kg=data.weight_kg,
        transport_mode=data.transport_mode,
        origin_country=origin,
    )
    result["transport"]["raw"]["reason"] = (
        reason or "EcoTransit API credentials are not configured."
    )
    return result


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
    return JSONResponse(status_code=500, content={"detail": f"Internal server error: {exc}"})


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


@app.post(
    "/api/calculate/batch",
    response_model=list[BatchCalculationResult],
    response_model_exclude_none=True,
    response_model_exclude_unset=True,
)
async def calculate_batch(rows: list[BatchCalculationRow]):
    return calculate_batch_emissions([
        row.model_dump(exclude_none=True, exclude_unset=True)
        for row in rows
    ])


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
        "line_items": [item.model_dump() for item in data.line_items] if data.line_items else None,
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


def _rag_http_error(exc: RagError) -> HTTPException:
    status_code = (
        400
        if isinstance(exc, (UnsupportedDocumentError, EmptyDocumentError))
        else 503
    )
    return HTTPException(status_code=status_code, detail=str(exc))


@app.post("/rag/documents", response_model=RagUploadResult)
async def upload_rag_documents(
    workspace_id: str = Form(...),
    files: list[UploadFile] = File(...),
):
    if not files:
        raise HTTPException(status_code=400, detail="Select at least one file.")

    results: list[RagDocument] = []
    for upload in files:
        filename = upload.filename or "unnamed"
        try:
            contents = await upload.read()
            record = rag_service.ingest(workspace_id, filename, contents)
            results.append(RagDocument(**asdict(record)))
        except RagError as exc:
            logger.warning("Supplier document indexing failed for %s: %s", filename, exc)
            results.append(
                RagDocument(
                    document_id="",
                    filename=filename,
                    file_type=Path(filename).suffix.lower().lstrip("."),
                    content_hash="",
                    chunk_count=0,
                    status="error",
                    error=str(exc),
                )
            )
        except Exception as exc:
            logger.exception("Unexpected supplier document indexing failure for %s", filename)
            results.append(
                RagDocument(
                    document_id="",
                    filename=filename,
                    file_type=Path(filename).suffix.lower().lstrip("."),
                    content_hash="",
                    chunk_count=0,
                    status="error",
                    error=f"Unexpected indexing failure: {exc}",
                )
            )
        finally:
            await upload.close()
    return RagUploadResult(documents=results)


@app.get("/rag/documents", response_model=list[RagDocument])
def list_rag_documents(
    workspace_id: str = Query(..., min_length=1, max_length=100),
):
    try:
        return [
            RagDocument(**asdict(document))
            for document in rag_service.list_documents(workspace_id)
        ]
    except RagError as exc:
        raise _rag_http_error(exc) from exc


@app.delete("/rag/documents/{document_id}", status_code=204)
def delete_rag_document(
    document_id: str,
    workspace_id: str = Query(..., min_length=1, max_length=100),
):
    try:
        deleted = rag_service.delete_document(workspace_id, document_id)
    except RagError as exc:
        raise _rag_http_error(exc) from exc
    if not deleted:
        raise HTTPException(status_code=404, detail="Document not found.")


def _format_retrieved_context(matches: list[SearchResult]) -> str:
    return "\n\n".join(
        (
            f"[Source {index}] {match.filename}, {match.location}\n"
            f"{match.excerpt}"
        )
        for index, match in enumerate(matches, start=1)
    )


@app.post("/method2-chat", response_model=ChatResponse)
def method2_chat(request: Method2ChatRequest):
    try:
        matches = rag_service.search(request.workspace_id, request.message)
    except RagError as exc:
        raise _rag_http_error(exc) from exc

    if not matches:
        return ChatResponse(
            reply=(
                "I could not find supporting information in the indexed supplier "
                "documents. Upload a relevant PDF or XLSX file, or ask about content "
                "that appears in the current document set."
            ),
            citations=[],
            grounded=False,
        )

    try:
        from openai import OpenAI
    except ImportError as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                f"OpenAI dependency missing: {exc}. Install requirements with "
                "`pip install -r requirements.txt`."
            ),
        ) from exc

    system_prompt = """
You are the Method 2 supplier-document assistant for a carbon emissions app.
Answer using only the supplied calculation context and retrieved evidence.
Do not invent emission factors, supplier claims, measurements, or document facts.
When evidence is incomplete, state what is missing. Cite evidence inline as
[Source 1], [Source 2], and so on. Keep the answer concise and practical.
""".strip()
    input_payload = {
        "question": request.message,
        "calculation_context": request.calculation_context,
        "recent_conversation": [
            message.model_dump() for message in request.messages[-6:]
        ],
        "retrieved_evidence": _format_retrieved_context(matches),
    }

    try:
        client = OpenAI(api_key=get_ai_key())
        response = client.responses.create(
            model=RAG_CHAT_MODEL,
            instructions=system_prompt,
            input=json.dumps(input_payload, ensure_ascii=True),
            max_output_tokens=600,
        )
        reply = response.output_text.strip()
        if not reply:
            raise ValueError("OpenAI API response did not contain a text reply.")
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Method 2 RAG chat failed: %s", exc)
        raise HTTPException(
            status_code=502, detail=f"Answer generation failed: {exc}"
        ) from exc

    return ChatResponse(
        reply=reply,
        citations=[ChatCitation(**asdict(match)) for match in matches],
        grounded=True,
    )


@app.get("/")
def home():
    return {"service": "c300-api", "status": "live"}


def check_reference_database() -> None:
    execute_with_retry("SELECT 1 AS ready", fetch="one")


def check_rag_storage() -> None:
    rag_service.data_root.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=rag_service.data_root):
        pass


@app.get("/health/ready")
def readiness():
    checks = {"database": "ready", "rag_storage": "ready"}

    try:
        check_reference_database()
    except (DatabaseUnavailable, OSError):
        logger.warning("Backend readiness check failed: reference database unavailable")
        checks["database"] = "unavailable"

    try:
        check_rag_storage()
    except OSError:
        logger.warning("Backend readiness check failed: RAG storage unavailable")
        checks["rag_storage"] = "unavailable"

    ready = all(status == "ready" for status in checks.values())
    return JSONResponse(
        status_code=200 if ready else 503,
        content={
            "service": "c300-api",
            "status": "ready" if ready else "not_ready",
            "checks": checks,
        },
    )


@app.post("/ecotransit")
def ecotransit(data: EcoTransitRequest):
    if os.getenv("ECOTRANSIT_API_URL", "").strip() and os.getenv("ECOTRANSIT_API_TOKEN", "").strip():
        return calculate_ecotransit_transport(
            port_of_loading=data.port_of_loading,
            port_of_discharge=data.port_of_discharge,
            weight_kg=data.weight_kg,
            transport_mode=data.transport_mode,
            origin_country=data.origin_country,
        )

    if os.getenv("ECOTRANSIT_ENABLE_SCRAPER", "").strip().lower() not in {"1", "true", "yes"}:
        if data.allow_estimate:
            return estimate_transport_response(
                data,
                "EcoTransit API credentials are not configured. The caller explicitly requested a local estimate.",
            )
        raise HTTPException(
            status_code=503,
            detail=(
                "EcoTransit is unavailable. Configure its API or explicitly allow a local "
                "transport estimate for this request."
            ),
        )

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
        logger.warning("EcoTransit scraper unavailable: %s", exc)
        if data.allow_estimate:
            return estimate_transport_response(data, str(exc))
        raise HTTPException(
            status_code=502,
            detail="EcoTransit could not calculate this route; no estimate was authorized.",
        ) from exc
    except Exception as exc:
        logger.exception("EcoTransit scraper failed: %s", exc)
        if data.allow_estimate:
            return estimate_transport_response(data, "EcoTransit scraper failed.")
        raise HTTPException(
            status_code=502,
            detail="EcoTransit could not calculate this route; no estimate was authorized.",
        ) from exc

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
            "estimated": False,
            "raw": result,
        }
    }


@app.get("/method2/machines")
def method2_machines():
    try:
        return {"machines": list_machine_library()}
    except MachineReferenceDataUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/method2/calculate")
def calculate_method2(data: Method2InputData):
    payload = {
        "part_id": data.part_id,
        "year": data.year,
        "raw_material_sgd": data.raw_material_sgd,
        "surface_treatment_sgd": data.surface_treatment_sgd,
        "naics": data.naics.model_dump(),
        "transport_emissions_kg": data.transport_emissions_kg,
        "transport_source": data.transport_source,
        "machining_entries": [
            {
                "machine_type": item.machine_type,
                "duty_level": item.duty_level,
                "operating_hours": item.operating_hours,
            }
            for item in data.machining_entries
        ],
    }

    try:
        return compute_method2(payload, spend_calculator=compute_emissions)
    except MachineReferenceDataUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


if __name__ == "__main__":
    import uvicorn

    configured_port = int(os.getenv("C300_API_PORT", "8000"))
    if configured_port < 1 or configured_port > 65535:
        raise ValueError(f"Invalid C300_API_PORT: {configured_port}")
    uvicorn.run(app, host="127.0.0.1", port=configured_port)
