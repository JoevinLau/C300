export interface NaicsOption {
  code: string
  description: string
  kgco2e_per_usd?: number
}

export const NAICS_CATALOG: NaicsOption[] = [
  {
    code: '332710',
    description: 'Machine Shops',
    kgco2e_per_usd: 0.85,
  },
  {
    code: '332812',
    description: 'Metal Coating, Engraving (except Jewelry and Silverware), and Allied Services',
    kgco2e_per_usd: 1.2,
  },
  {
    code: '333249',
    description: 'Other Industrial Machinery Manufacturing',
  },
  {
    code: '331110',
    description: 'Iron and Steel Mills and Ferroalloy Manufacturing',
  },
  {
    code: '332322',
    description: 'Sheet Metal Work Manufacturing',
  },
  {
    code: '332313',
    description: 'Plate Work Manufacturing',
  },
  {
    code: '332721',
    description: 'Precision Turned Product Manufacturing',
  },
  {
    code: '332999',
    description: 'All Other Miscellaneous Fabricated Metal Product Manufacturing',
  },
]

export function naicsCatalogByCode(options: NaicsOption[] = NAICS_CATALOG): Map<string, NaicsOption> {
  return new Map(options.map((option) => [option.code, option]))
}
