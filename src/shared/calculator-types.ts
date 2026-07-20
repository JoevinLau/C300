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
  line_items?: CalculationLineItemRequest[]
}

export type CalculationCategory = 'raw_material' | 'fabrication' | 'surface_treatment'

export interface CalculationLineItemRequest {
  category: CalculationCategory
  amount_sgd: number
  naics_code: string
}

export interface CalculationLineItemResult extends CalculationLineItemRequest {
  amount_usd: number
  amount_usd2022: number
  factor: number
  emission: number
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
  line_items?: CalculationLineItemResult[]
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

export interface BatchCalculationRequestRow {
  supplier?: string
  material?: string
  material_name?: string
  weight?: number
  qty?: number
  year?: number
  total_amount_sgd: number
  mapped_naics?: string
  naics_code?: string
  description?: string
  kgco2e?: string
  category?: string
}

export interface BatchCalculationResult extends BatchCalculationRequestRow {
  mapped_naics: string
  naics_description: string
  kgco2e_per_usd: number
  total_kgco2e: number
  data_source?: string
}

export interface EcoTransitRequest {
  port_of_loading: string
  port_of_discharge: string
  weight_kg: number
  transport_mode: 'sea' | 'land' | 'air' | 'rail' | 'truck' | 'vessel'
  origin_country?: string
  allow_estimate?: boolean
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
    estimated: boolean
    raw: Record<string, unknown>
  }
}

export interface Method2MachineReference {
  machineType: string
  dutyLevel: string
  avgKW: number
  hourlyEmission: number
  countryCode?: string
  gridFactor?: number
  gridYear?: number
  gridSource?: string
  dataSource?: string
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
      countryCode: string
      gridFactor: number
      gridYear: number
      gridSource: string
      dataSource: string
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

export type Method3PurchaseType =
  | 'imported_raw_material'
  | 'local_processing'
  | 'overseas_processing'

export interface Method3Country {
  code: string
  name: string
}

export interface Method3Sector {
  code: string
  name: string
  naics_code?: string | null
}

export interface Method3PurchaseTypeOption {
  code: Method3PurchaseType
  label: string
  price_index_type: string
  price_index_label: string
}

export interface Method3DatasetSummary {
  version: string
  reference_price_year: number
  currency: 'SGD'
  price_basis: 'purchaser_price'
  release_date?: string | null
  attribution: string
}

export interface Method3ReferenceDataResponse {
  dataset: Method3DatasetSummary
  countries: Method3Country[]
  sectors: Method3Sector[]
  purchase_types: Method3PurchaseTypeOption[]
}

export interface Method3BasisRequest {
  purchase_year: number
  purchase_month: number
  purchase_type: Method3PurchaseType
  country_code: string
  sector_code: string
}

export interface Method3CalculationBasis {
  dataset_version: string
  country_code: string
  country_name: string
  sector_code: string
  sector_name: string
  purchase_type: Method3PurchaseType
  purchase_type_label: string
  price_index_type: string
  price_index_label: string
  purchase_period: string
  purchase_index: number
  reference_price_year: number
  reference_index: number
  reference_index_method: 'annual_average'
  index_base_year: number
  price_basis: 'purchaser_price'
  currency: 'SGD'
  emission_factor: number
  factor_unit: 'kgCO2e/SGD'
  factor_source: string
  price_index_source: string
}

export interface Method3CalculateRequest extends Method3BasisRequest {
  invoice_id: string
  purchase_description: string
  invoice_amount_sgd: number
}

export interface Method3CalculateResponse {
  invoice_id: string
  purchase_description: string
  original_spend_sgd: number
  normalized_spend_sgd: number
  adjustment_factor: number
  adjustment_percent: number
  estimated_emissions_kgco2e: number
  estimated_emissions_tco2e: number
  calculated_at: string
  basis: Method3CalculationBasis
}
