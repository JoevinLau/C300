# main.py
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator

from service import get_fx_and_inflation, get_kgco2e_per_usd, list_naics_options
from calculator import compute_emissions

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


# ---------- INPUT MODELS ----------


class Allocation(BaseModel):
    raw_material_pct: float = Field(..., ge=0)
    fabrication_pct: float = Field(..., ge=0)
    surface_treatment_pct: float = Field(..., ge=0)

    @validator("surface_treatment_pct")
    def validate_total(cls, v, values):
        total = (
            v
            + values.get("raw_material_pct", 0)
            + values.get("fabrication_pct", 0)
        )
        if abs(total - 100) > 0.01:
            raise ValueError("Allocation percentages must add up to 100.")
        return v


class Naics(BaseModel):
    raw_material: str = Field(..., min_length=6, max_length=6)
    fabrication: str = Field(..., min_length=6, max_length=6)
    surface_treatment: str = Field(..., min_length=6, max_length=6)


class InputData(BaseModel):
    invoice_id: str = Field(..., min_length=1)
    year: int = Field(..., ge=2020, le=2030)
    total_amount_sgd: float = Field(..., gt=0)
    allocation: Allocation
    naics: Naics


# ---------- OUTPUT MODELS ----------


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
    costs: CostBreakdown
    emissions: EmissionBreakdown


class NaicsOption(BaseModel):
    code: str
    description: str
    kgco2e_per_usd: float | None = None


# ---------- ENDPOINTS ----------


@app.get("/naics", response_model=list[NaicsOption])
def get_naics_options():
    return list_naics_options()


@app.post("/calculate", response_model=OutputData)
def calculate_emissions(data: InputData):
    # 1) Fetch DB data (connectivity happens here)
    sgd_to_usd, us_inflation = get_fx_and_inflation(data.year)

    k_raw = get_kgco2e_per_usd(data.naics.raw_material)
    k_fab = get_kgco2e_per_usd(data.naics.fabrication)
    k_surf = get_kgco2e_per_usd(data.naics.surface_treatment)

    # 2) Prepare payload for the calculator module
    payload = {
        "invoice_id": data.invoice_id,
        "year": data.year,
        "total_amount_sgd": data.total_amount_sgd,
        "allocation": data.allocation.model_dump(),
        "naics": data.naics.model_dump(),
        "fx": sgd_to_usd,
        "inflation": us_inflation,
        "factors": {
            "raw_material": k_raw,
            "fabrication": k_fab,
            "surface_treatment": k_surf,
        },
    }

    # 3) Delegate all math to your teammate’s function
    result = compute_emissions(payload)

    return OutputData(
        invoice_id=data.invoice_id,
        costs=CostBreakdown(**result["costs"]),
        emissions=EmissionBreakdown(**result["emissions"]),
    )


@app.get("/")
def home():
    return {"message": "API is running!"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)