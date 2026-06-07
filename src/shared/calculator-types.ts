export interface CalculateRequest {
  invoice_id: string
  year: number
  total_amount_sgd: number
  allocation: {
    raw_material_pct: number
    fabrication_pct: number
    surface_treatment_pct: number
  }
  naics: {
    raw_material: string
    fabrication: string
    surface_treatment: string
  }
}

export interface CalculationDetails {
  fx_rate: number
  inflation_index: number
  year: number
  sgd_amounts: {
    raw_material: number
    fabrication: number
    surface_treatment: number
  }
  usd_amounts: {
    raw_material: number
    fabrication: number
    surface_treatment: number
  }
  usd2022_amounts: {
    raw_material: number
    fabrication: number
    surface_treatment: number
  }
  factors: {
    raw_material: number
    fabrication: number
    surface_treatment: number
  }
}

export interface CalculateResponse {
  invoice_id: string
  calculation: CalculationDetails
  costs: {
    raw_material_usd2022: number
    fabrication_usd2022: number
    surface_treatment_usd2022: number
  }
  emissions: {
    raw_material: number
    fabrication: number
    surface_treatment: number
    total: number
  }
}

export interface NaicsOption {
  code: string
  description: string
  kgco2e_per_usd?: number
}
