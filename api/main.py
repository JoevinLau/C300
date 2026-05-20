from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, validator

app = FastAPI()


# ----------------------
# INPUT MODELS
# ----------------------

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


# ----------------------
# OUTPUT MODELS
# ----------------------

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


# ----------------------
# MAIN API ENDPOINT
# ----------------------

@app.post("/calculate", response_model=OutputData)
def calculate_emissions(data: InputData):

    # MOCK CALCULATIONS (replace these later)
    mock_costs = CostBreakdown(
        raw_material_usd2022=1173.03,
        fabrication_usd2022=3519.09,
        surface_treatment_usd2022=1173.03
    )

    mock_emissions = EmissionBreakdown(
        raw_material=12.5,
        fabrication=30.2,
        surface_treatment=5.3,
        total=48.0
    )

    return OutputData(
        invoice_id=data.invoice_id,
        costs=mock_costs,
        emissions=mock_emissions
    )


@app.get("/")
def home():
    return {"message": "API is running!"}