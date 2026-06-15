export interface NaicsOption {
  code: string
  description: string
  category?: string
  kgco2e_per_usd?: number
}

export const NAICS_CATALOG: NaicsOption[] = []

export function naicsCatalogByCode(options: NaicsOption[] = NAICS_CATALOG): Map<string, NaicsOption> {
  return new Map(options.map((option) => [option.code, option]))
}
