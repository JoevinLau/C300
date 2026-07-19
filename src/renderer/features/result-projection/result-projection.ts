import type {
  CalculateResponse,
  CalculationCategory,
  CalculationLineItemResult,
  Method2CalculateRequest,
  Method2CalculateResponse,
} from '../../../shared/calculator-types'

export const USEEIO_CATEGORY_DEFINITIONS = [
  { key: 'raw_material', label: 'Raw material' },
  { key: 'fabrication', label: 'Fabrication' },
  { key: 'surface_treatment', label: 'Surface treatment' },
] as const satisfies ReadonlyArray<{ key: CalculationCategory; label: string }>

export type UseeioCategoryKey = typeof USEEIO_CATEGORY_DEFINITIONS[number]['key']

export interface ProjectedCalculationLine {
  amountSgd: number
  amountUsd: number
  amountUsd2022: number
  naicsCode: string | null
  factor: number
  emissions: number
}

export interface UseeioCategoryProjection {
  key: UseeioCategoryKey
  label: string
  amountSgd: number
  amountUsd: number
  amountUsd2022: number
  factor: number
  emissions: number
  naicsCodes: string[]
  lines: ProjectedCalculationLine[]
}

export interface ProjectionTransport {
  chosen_emissions_kg: number | null
}

export interface UseeioResultProjection {
  documentId: string
  year: number
  fxRate: number
  inflationIndex: number
  inflationBaseIndex: number
  categories: UseeioCategoryProjection[]
  totals: {
    inputSgd: number
    allocatedSgd: number
    usd: number
    usd2022: number
    componentEmissions: number
    useeioEmissions: number
    transportEmissions: number | null
    reportedEmissions: number
    intensityKgPerUsd2022: number | null
  }
  reconciliation: {
    allocationDifference: number
    emissionsDifference: number
    totalsReconcile: boolean
  }
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function getInflationBaseIndex(result: CalculateResponse): number {
  const candidates = [
    ...(result.calculation.line_items ?? []).map((item) => ({
      amountUsd: item.amount_usd,
      amountUsd2022: item.amount_usd2022,
    })),
    ...USEEIO_CATEGORY_DEFINITIONS.map(({ key }) => ({
      amountUsd: result.calculation.usd_amounts[key],
      amountUsd2022: result.calculation.usd2022_amounts[key],
    })),
  ]

  const candidate = candidates.find(
    ({ amountUsd, amountUsd2022 }) =>
      amountUsd > 0 && Number.isFinite(amountUsd2022 / amountUsd),
  )

  return candidate
    ? (candidate.amountUsd2022 / candidate.amountUsd) * result.calculation.inflation_index
    : 100
}

function projectLine(item: CalculationLineItemResult): ProjectedCalculationLine {
  return {
    amountSgd: item.amount_sgd,
    amountUsd: item.amount_usd,
    amountUsd2022: item.amount_usd2022,
    naicsCode: item.naics_code,
    factor: item.factor,
    emissions: item.emission,
  }
}

export function createUseeioResultProjection({
  result,
  totalAmountSgd,
  transport = null,
  fallbackNaics = {},
}: {
  result: CalculateResponse
  totalAmountSgd: number
  transport?: ProjectionTransport | null
  fallbackNaics?: Partial<Record<CalculationCategory, string>>
}): UseeioResultProjection {
  const categories = USEEIO_CATEGORY_DEFINITIONS.map(({ key, label }) => {
    const matchingLines = (result.calculation.line_items ?? [])
      .filter((item) => item.category === key)
      .map(projectLine)
    const lines = matchingLines.length > 0
      ? matchingLines
      : [{
          amountSgd: result.calculation.sgd_amounts[key],
          amountUsd: result.calculation.usd_amounts[key],
          amountUsd2022: result.calculation.usd2022_amounts[key],
          naicsCode: fallbackNaics[key] || null,
          factor: result.calculation.factors[key],
          emissions: result.emissions[key],
        }]

    return {
      key,
      label,
      amountSgd: result.calculation.sgd_amounts[key],
      amountUsd: result.calculation.usd_amounts[key],
      amountUsd2022: result.calculation.usd2022_amounts[key],
      factor: result.calculation.factors[key],
      emissions: result.emissions[key],
      naicsCodes: Array.from(
        new Set(lines.map((line) => line.naicsCode).filter((code): code is string => Boolean(code))),
      ),
      lines,
    }
  })
  const allocatedSgd = sum(categories.map((category) => category.amountSgd))
  const totalUsd = sum(categories.map((category) => category.amountUsd))
  const totalUsd2022 = sum(categories.map((category) => category.amountUsd2022))
  const componentEmissions = sum(categories.map((category) => category.emissions))
  const transportEmissions = transport?.chosen_emissions_kg ?? null
  const allocationDifference = allocatedSgd - totalAmountSgd
  const emissionsDifference = componentEmissions - result.emissions.total

  return {
    documentId: result.invoice_id,
    year: result.calculation.year,
    fxRate: result.calculation.fx_rate,
    inflationIndex: result.calculation.inflation_index,
    inflationBaseIndex: getInflationBaseIndex(result),
    categories,
    totals: {
      inputSgd: totalAmountSgd,
      allocatedSgd,
      usd: totalUsd,
      usd2022: totalUsd2022,
      componentEmissions,
      useeioEmissions: result.emissions.total,
      transportEmissions,
      reportedEmissions: result.emissions.total + (transportEmissions ?? 0),
      intensityKgPerUsd2022: totalUsd2022 > 0
        ? result.emissions.total / totalUsd2022
        : null,
    },
    reconciliation: {
      allocationDifference,
      emissionsDifference,
      totalsReconcile:
        Math.abs(allocationDifference) <= 0.01 && Math.abs(emissionsDifference) <= 0.01,
    },
  }
}

export const METHOD2_CATEGORY_DEFINITIONS = [
  { key: 'raw_material', label: 'Raw material' },
  { key: 'transportation', label: 'Transportation' },
  { key: 'machining', label: 'Machining' },
  { key: 'surface_treatment', label: 'Surface treatment' },
] as const

export type Method2CategoryKey = typeof METHOD2_CATEGORY_DEFINITIONS[number]['key']

export interface Method2ResultProjection {
  documentId: string
  year: number
  transportWeightKg: number | null
  categories: Array<{
    key: Method2CategoryKey
    label: string
    emissions: number
  }>
  spendCategories: Array<{
    key: 'raw_material' | 'surface_treatment'
    label: string
    amountSgd: number
    amountUsd2022: number
    factor: number
    emissions: number
    naicsCode: string
  }>
  machining: Method2CalculateResponse['machining']
  transport: Method2CalculateResponse['transport']
  totals: {
    componentEmissions: number
    reportedEmissions: number
  }
  reconciliation: {
    emissionsDifference: number
    totalsReconcile: boolean
  }
}

export function createMethod2ResultProjection({
  result,
  request,
  transport = null,
}: {
  result: Method2CalculateResponse
  request: Method2CalculateRequest
  transport?: { weight_kg: number } | null
}): Method2ResultProjection {
  const categories = METHOD2_CATEGORY_DEFINITIONS.map(({ key, label }) => ({
    key,
    label,
    emissions: result.emissions[key],
  }))
  const componentEmissions = sum(categories.map((category) => category.emissions))
  const emissionsDifference = componentEmissions - result.emissions.total

  return {
    documentId: result.part_id,
    year: result.calculation.year,
    transportWeightKg: transport?.weight_kg ?? null,
    categories,
    spendCategories: [
      {
        key: 'raw_material',
        label: 'Raw material',
        amountSgd: result.calculation.sgd_amounts.raw_material,
        amountUsd2022: result.calculation.usd2022_amounts.raw_material,
        factor: result.calculation.factors.raw_material,
        emissions: result.emissions.raw_material,
        naicsCode: request.naics.raw_material,
      },
      {
        key: 'surface_treatment',
        label: 'Surface treatment',
        amountSgd: result.calculation.sgd_amounts.surface_treatment,
        amountUsd2022: result.calculation.usd2022_amounts.surface_treatment,
        factor: result.calculation.factors.surface_treatment,
        emissions: result.emissions.surface_treatment,
        naicsCode: request.naics.surface_treatment,
      },
    ],
    machining: result.machining,
    transport: result.transport,
    totals: {
      componentEmissions,
      reportedEmissions: result.emissions.total,
    },
    reconciliation: {
      emissionsDifference,
      totalsReconcile: Math.abs(emissionsDifference) <= 0.01,
    },
  }
}
