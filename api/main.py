# main.py
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, model_validator

from service import list_naics_options
from calculator import compute_emissions
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name('.env'))

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
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {exc}"},
    )


class Allocation(BaseModel):
    raw_material_pct: float = Field(..., ge=0)
    fabrication_pct: float = Field(..., ge=0)
    surface_treatment_pct: float = Field(..., ge=0)

    @model_validator(mode="after")
    def validate_allocation_total(self) -> "Allocation":
        total = (
            self.raw_material_pct
            + self.fabrication_pct
            + self.surface_treatment_pct
        )
        if abs(total - 100) > 0.01:
            raise ValueError("Allocation percentages must add up to 100.")
        return self


class Naics(BaseModel):
    raw_material: str = Field(..., min_length=6, max_length=6)
    fabrication: str = Field(..., min_length=6, max_length=6)
    surface_treatment: str = Field(..., min_length=6, max_length=6)


class SgdAmountsInput(BaseModel):
    raw_material: float = Field(..., ge=0)
    fabrication: float = Field(..., ge=0)
    surface_treatment: float = Field(..., ge=0)


class InputData(BaseModel):
    invoice_id: str = Field(..., min_length=1)
    year: int = Field(..., ge=2020, le=2030)
    total_amount_sgd: float = Field(..., gt=0)
    sgd_amounts: SgdAmountsInput | None = None
    allocation: Allocation | None = None
    naics: Naics

    @model_validator(mode="before")
    @classmethod
    def normalize_amounts(cls, data: object) -> object:
        if not isinstance(data, dict):
            return data

        total = data.get("total_amount_sgd")
        sgd_amounts = data.get("sgd_amounts")
        allocation = data.get("allocation")

        if sgd_amounts is None and allocation is not None and total is not None:
            data = {**data, "sgd_amounts": {
                "raw_material": total * allocation["raw_material_pct"] / 100.0,
                "fabrication": total * allocation["fabrication_pct"] / 100.0,
                "surface_treatment": total * allocation["surface_treatment_pct"] / 100.0,
            }}

        return data

    @model_validator(mode="after")
    def validate_sgd_amounts_sum(self) -> "InputData":
        if self.sgd_amounts is None:
            raise ValueError("sgd_amounts or allocation is required")

        component_sum = (
            self.sgd_amounts.raw_material
            + self.sgd_amounts.fabrication
            + self.sgd_amounts.surface_treatment
        )
        if abs(component_sum - self.total_amount_sgd) > 0.01:
            raise ValueError(
                "sgd_amounts must sum to total_amount_sgd "
                f"(got {component_sum:.2f} vs {self.total_amount_sgd:.2f})"
            )
        return self


class SgdAmounts(BaseModel):
    raw_material: float
    fabrication: float
    surface_treatment: float


class UsdAmounts(BaseModel):
    raw_material: float
    fabrication: float
    surface_treatment: float


class Usd2022Amounts(BaseModel):
    raw_material: float
    fabrication: float
    surface_treatment: float


class EmissionFactors(BaseModel):
    raw_material: float
    fabrication: float
    surface_treatment: float


class CalculationDetails(BaseModel):
    fx_rate: float
    inflation_index: float
    year: int
    sgd_amounts: SgdAmounts
    usd_amounts: UsdAmounts
    usd2022_amounts: Usd2022Amounts
    factors: EmissionFactors


class CostBreakdown(BaseModel):
    raw_material_usd2022: float
    fabrication_usd2022: float
    surface_treatment_usd2022: float


class EmissionBreakdown(BaseModel):
    raw_material: float
    fabrication: float
    surface_treatment: float
    total: float


class OutputData(BaseModel):
    invoice_id: str
    calculation: CalculationDetails
    costs: CostBreakdown
    emissions: EmissionBreakdown


class NaicsOption(BaseModel):
    code: str
    description: str
    category: str | None = None
    kgco2e_per_usd: float | None = None

# ---------- ENDPOINTS ----------


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
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return OutputData(
        invoice_id=data.invoice_id,
        calculation=CalculationDetails(**result["calculation"]),
        costs=CostBreakdown(**result["costs"]),
        emissions=EmissionBreakdown(**result["emissions"]),
    )


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)


class ChatResponse(BaseModel):
    reply: str


@app.post("/method2-chat", response_model=ChatResponse)
def method2_chat(req: ChatRequest):
    key = os.environ.get("AI_KEY")
    if not key:
        raise HTTPException(
            status_code=500,
            detail="AI_KEY environment variable not set. Place AI_KEY=your_new_key_here in .env.",
        )

    try:
        from openai import OpenAI
    except ImportError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"OpenAI dependency missing: {exc}. Install requirements with `pip install -r requirements.txt`.",
        ) from exc

    try:
        client = OpenAI(api_key=key)
        resp = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": req.message}],
            max_tokens=500,
        )
        choice = resp.choices[0] if resp.choices else None
        text = None
        if choice and hasattr(choice, 'message') and choice.message is not None:
            text = choice.message.get('content') if isinstance(choice.message, dict) else getattr(choice.message, 'content', None)
        if not isinstance(text, str):
            raise ValueError("OpenAI API response did not contain a valid text reply.")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return ChatResponse(reply=text)

@app.get("/")
def home():
    return {"message": "API is running!"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
