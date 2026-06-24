export interface CalculateRequest {
  invoice_id: string
  year: number
  total_amount_sgd: number
  sgd_amounts: {
    raw_material: number
    fabrication: number
    surface_treatment: number
  }
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
  category?: string
  kgco2e_per_usd?: number
}

export interface EcoTransitRequest {
  port_of_loading: string
  port_of_discharge: string
  weight_kg: number
  transport_mode: 'sea' | 'land' | 'air' | 'rail' | 'truck' | 'vessel'
  origin_country?: string
}

export interface EcoTransitResponse {
  transport: {
    origin: string
    port_of_loading: string
    port_of_discharge: string
    weight_kg: number
    chosen_mode: string
    chosen_emissions_kg: number | null
    distance_km: number | null
    energy_mj: number | null
    source: string
    raw: Record<string, unknown>
  }
}

export interface Method2MachineReference {
  machineType: string
  dutyLevel: string
  avgKW: number
  hourlyEmission: number
}

export interface Method2MachiningEntryRequest {
  machine_type: string
  duty_level: string
  operating_hours: number
}

export interface Method2CalculateRequest {
  part_id: string
  year: number
  raw_material_sgd: number
  surface_treatment_sgd: number
  naics: {
    raw_material: string
    surface_treatment: string
    fabrication?: string
  }
  transport_emissions_kg: number
  transport_source?: string
  machining_entries: Method2MachiningEntryRequest[]
}

export interface Method2CalculateResponse {
  part_id: string
  calculation: CalculationDetails
  costs: {
    raw_material_usd2022: number
    surface_treatment_usd2022: number
  }
  machining: {
    entries: Array<{
      machineType: string
      dutyLevel: string
      avgKW: number
      hourlyEmission: number
      operatingHours: number
      emissions: number
    }>
    total: number
  }
  transport: {
    emissions: number
    source: string
  }
  emissions: {
    raw_material: number
    transportation: number
    surface_treatment: number
    machining: number
    total: number
  }
  notes: Record<string, string>
}
