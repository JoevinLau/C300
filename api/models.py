from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

try:
    from dev_data import MAX_CALCULATION_YEAR, MIN_CALCULATION_YEAR
except ModuleNotFoundError:
    from api.dev_data import MAX_CALCULATION_YEAR, MIN_CALCULATION_YEAR


class StrictApiModel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class Allocation(StrictApiModel):
    raw_material_pct: float = Field(..., ge=0)
    fabrication_pct: float = Field(..., ge=0)
    surface_treatment_pct: float = Field(..., ge=0)

    @model_validator(mode="after")
    def validate_allocation_total(self) -> "Allocation":
        total = self.raw_material_pct + self.fabrication_pct + self.surface_treatment_pct
        if abs(total - 100) > 0.01:
            raise ValueError("Allocation percentages must add up to 100.")
        return self


class Naics(StrictApiModel):
    raw_material: str = Field(..., pattern=r"^\d{6}$")
    fabrication: str = Field(..., pattern=r"^\d{6}$")
    surface_treatment: str = Field(..., pattern=r"^\d{6}$")


class SgdAmountsInput(StrictApiModel):
    raw_material: float = Field(..., ge=0)
    fabrication: float = Field(..., ge=0)
    surface_treatment: float = Field(..., ge=0)


class Method1LineItemInput(StrictApiModel):
    category: Literal["raw_material", "fabrication", "surface_treatment"]
    amount_sgd: float = Field(..., gt=0)
    naics_code: str = Field(..., pattern=r"^\d{6}$")


class InputData(StrictApiModel):
    invoice_id: str = Field(..., min_length=1, max_length=128)
    year: int = Field(..., ge=MIN_CALCULATION_YEAR, le=MAX_CALCULATION_YEAR)
    total_amount_sgd: float = Field(..., gt=0)
    sgd_amounts: SgdAmountsInput | None = None
    allocation: Allocation | None = None
    naics: Naics
    line_items: list[Method1LineItemInput] | None = None

    @model_validator(mode="before")
    @classmethod
    def normalize_amounts(cls, data: object) -> object:
        if not isinstance(data, dict):
            return data

        total = data.get("total_amount_sgd")
        allocation = data.get("allocation")
        if data.get("sgd_amounts") is None and allocation is not None and total is not None:
            data = {
                **data,
                "sgd_amounts": {
                    "raw_material": float(total) * float(allocation["raw_material_pct"]) / 100.0,
                    "fabrication": float(total) * float(allocation["fabrication_pct"]) / 100.0,
                    "surface_treatment": float(total) * float(allocation["surface_treatment_pct"]) / 100.0,
                },
            }
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


class SgdAmounts(StrictApiModel):
    raw_material: float
    fabrication: float
    surface_treatment: float


class UsdAmounts(StrictApiModel):
    raw_material: float
    fabrication: float
    surface_treatment: float


class Usd2022Amounts(StrictApiModel):
    raw_material: float
    fabrication: float
    surface_treatment: float


class EmissionFactors(StrictApiModel):
    raw_material: float
    fabrication: float
    surface_treatment: float


class Method1LineItemResult(StrictApiModel):
    category: Literal["raw_material", "fabrication", "surface_treatment"]
    amount_sgd: float
    amount_usd: float
    amount_usd2022: float
    naics_code: str = Field(..., pattern=r"^\d{6}$")
    factor: float
    emission: float


class CalculationDetails(StrictApiModel):
    fx_rate: float
    inflation_index: float
    year: int
    sgd_amounts: SgdAmounts
    usd_amounts: UsdAmounts
    usd2022_amounts: Usd2022Amounts
    factors: EmissionFactors
    line_items: list[Method1LineItemResult] | None = None


class CostBreakdown(StrictApiModel):
    raw_material_usd2022: float
    fabrication_usd2022: float
    surface_treatment_usd2022: float


class EmissionBreakdown(StrictApiModel):
    raw_material: float
    fabrication: float
    surface_treatment: float
    total: float


class OutputData(StrictApiModel):
    invoice_id: str
    calculation: CalculationDetails
    costs: CostBreakdown
    emissions: EmissionBreakdown


class NaicsOption(StrictApiModel):
    code: str = Field(..., pattern=r"^\d{6}$")
    description: str
    category: str | None = None
    kgco2e_per_usd: float | None = None
    data_source: str | None = None


class MappingLearnRequest(StrictApiModel):
    keyword: str = Field(..., min_length=1, max_length=255)
    naics_code: str = Field(..., pattern=r"^\d{6}$")
    description: str = ""
    category: str = ""


class NaicsConfirmRequest(StrictApiModel):
    material_token: str = Field(..., min_length=1, max_length=255)
    mapped_naics: str = Field(..., pattern=r"^\d{6}$")
    user_id: str = Field("default", min_length=1, max_length=128)

    @field_validator("material_token")
    @classmethod
    def reject_numeric_only_materials(cls, value: str) -> str:
        if value.strip().isdigit():
            raise ValueError("material_token cannot be only digits.")
        return value


class NaicsMatch(StrictApiModel):
    code: str = Field(..., pattern=r"^\d{6}$")
    description: str
    kgco2e_per_usd: float | None = None
    data_source: str | None = None
    source: str
    confidence: Literal["exact", "partial", "confirmed", "low"] | str


class NaicsSearchResponse(StrictApiModel):
    query: str
    material_token: str
    tier: int = Field(..., ge=1, le=3)
    matches: list[NaicsMatch]


class NaicsSuggestionResponse(StrictApiModel):
    material_token: str
    suggested_naics: str = Field(..., pattern=r"^\d{6}$")
    source: str


class BatchCalculationRow(StrictApiModel):
    supplier: str | None = None
    material: str | None = Field(None, min_length=1, max_length=255)
    material_name: str | None = Field(None, min_length=1, max_length=255)
    weight: float | None = Field(None, ge=0)
    qty: float | None = Field(None, ge=0)
    year: int = Field(
        MAX_CALCULATION_YEAR,
        ge=MIN_CALCULATION_YEAR,
        le=MAX_CALCULATION_YEAR,
    )
    total_amount_sgd: float = Field(..., ge=0)
    mapped_naics: str | None = Field(None, pattern=r"^\d{6}$")
    naics_code: str | None = Field(None, pattern=r"^\d{6}$")
    description: str | None = None
    kgco2e: str | None = None
    category: str | None = None

    @model_validator(mode="after")
    def validate_batch_row(self) -> "BatchCalculationRow":
        if not (self.material or self.material_name):
            raise ValueError("material or material_name is required.")
        if not (self.mapped_naics or self.naics_code):
            raise ValueError("mapped_naics or naics_code is required.")
        return self


class BatchCalculationResult(BatchCalculationRow):
    mapped_naics: str = Field(..., pattern=r"^\d{6}$")
    naics_description: str
    kgco2e_per_usd: float
    data_source: str | None = None
    total_kgco2e: float


class Method2Naics(StrictApiModel):
    raw_material: str = Field(..., pattern=r"^\d{6}$")
    surface_treatment: str = Field(..., pattern=r"^\d{6}$")
    fabrication: str = Field("333517", pattern=r"^\d{6}$")


class Method2MachiningEntry(StrictApiModel):
    machine_type: str = Field(..., min_length=1)
    duty_level: str = Field(..., min_length=1)
    operating_hours: float = Field(..., ge=0)


class Method2InputData(StrictApiModel):
    part_id: str = Field(..., min_length=1)
    year: int = Field(..., ge=MIN_CALCULATION_YEAR, le=MAX_CALCULATION_YEAR)
    raw_material_sgd: float = Field(..., ge=0)
    surface_treatment_sgd: float = Field(..., ge=0)
    naics: Method2Naics
    transport_emissions_kg: float = Field(0, ge=0)
    transport_source: str = "EcoTransit World"
    machining_entries: list[Method2MachiningEntry] = Field(default_factory=list)


class RagDocument(StrictApiModel):
    document_id: str
    filename: str
    file_type: str
    content_hash: str
    chunk_count: int
    status: str
    error: str | None = None


class RagUploadResult(StrictApiModel):
    documents: list[RagDocument]


class ChatHistoryMessage(StrictApiModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=8000)


class Method2ChatRequest(StrictApiModel):
    workspace_id: str = Field(..., min_length=1, max_length=100)
    message: str = Field(..., min_length=1, max_length=8000)
    calculation_context: dict[str, Any] = Field(default_factory=dict)
    messages: list[ChatHistoryMessage] = Field(default_factory=list, max_length=12)


class ChatCitation(StrictApiModel):
    document_id: str
    filename: str
    location: str
    excerpt: str
    score: float


class ChatResponse(StrictApiModel):
    reply: str
    citations: list[ChatCitation]
    grounded: bool


class EcoTransitRequest(StrictApiModel):
    port_of_loading: str = Field(..., min_length=1)
    port_of_discharge: str = Field("Singapore", min_length=1)
    weight_kg: float = Field(..., gt=0)
    transport_mode: Literal["sea", "land", "air", "rail", "truck", "vessel", "ship"] = "sea"
    origin_country: str | None = None
    allow_estimate: bool = False


class EcoTransitTransport(StrictApiModel):
    origin: str
    port_of_loading: str
    port_of_discharge: str
    weight_kg: float
    chosen_mode: str
    chosen_emissions_kg: float | None = None
    distance_km: float | None = None
    energy_mj: float | None = None
    source: str
    estimated: bool
    raw: dict[str, Any]


class EcoTransitResponse(StrictApiModel):
    transport: EcoTransitTransport
