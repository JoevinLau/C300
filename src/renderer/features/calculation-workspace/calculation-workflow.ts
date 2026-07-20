export type LineItem = {
  amount: string
  naics: string
}

export interface AllocationCategoryInput<
  CategoryId extends string = string,
  FormKey extends string = string,
> {
  id: CategoryId
  amountKey: FormKey
  label: string
  barClass: string
}

export type LineItemsByCategory<CategoryId extends string> = Partial<
  Record<CategoryId, readonly LineItem[]>
>

export interface AllocationSegment {
  label: string
  amount: number
  pct: number
  className: string
}

export interface DerivedAllocationState<
  CategoryId extends string,
  Category extends AllocationCategoryInput<CategoryId, string>,
> {
  categoryAmounts: Array<Category & { amount: number }>
  allocationSum: number
  totalAmount: number
  hasInvoiceTotal: boolean
  allocationValid: boolean
  remaining: number
  segments: AllocationSegment[]
  percentages: Record<CategoryId, number>
}

export type TransportMode = 'sea' | 'land' | 'air'

export const MIN_CALCULATION_YEAR = 2022
export const MAX_CALCULATION_YEAR = 2026

export function isSupportedCalculationYear(year: number): boolean {
  return (
    Number.isInteger(year) &&
    year >= MIN_CALCULATION_YEAR &&
    year <= MAX_CALCULATION_YEAR
  )
}

export interface MatchedTransportPort {
  country: string
}

export interface TransportCalculationFields {
  weight: string
  origin: string
  portOfLoading: string
  portOfDischarge: string
  mode: TransportMode
  matchedPort?: MatchedTransportPort | null
  allowEstimate?: boolean
}

export interface TransportCalculationRequest {
  origin_country: string
  port_of_loading: string
  port_of_discharge: string
  weight_kg: number
  transport_mode: TransportMode
  allow_estimate: boolean
}

export const TRANSPORT_VALIDATION_ERRORS = {
  weight: 'Enter a valid shipment weight in kg',
  origin: 'Enter origin country',
  loadingPort: 'Enter port of loading',
  dischargePort: 'Enter port of discharge',
} as const

export type TransportValidationError =
  (typeof TRANSPORT_VALIDATION_ERRORS)[keyof typeof TRANSPORT_VALIDATION_ERRORS]

export type TransportCalculationValidation =
  | { ok: true; request: TransportCalculationRequest }
  | { ok: false; error: TransportValidationError }

export function parseAmount(value: string): number {
  const normalized = String(value).trim().replace(/,/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

export function pctFromAmount(amount: number, total: number): number {
  if (total <= 0) return 0
  return (amount / total) * 100
}

export function deriveAllocationState<
  CategoryId extends string,
  FormKey extends string,
  Category extends AllocationCategoryInput<CategoryId, FormKey>,
>({
  categories,
  form,
  lineItems,
  totalAmountKey,
  requireInvoiceTotal = true,
  reconcileAllocationToTotal = true,
}: {
  categories: readonly Category[]
  form: Readonly<Record<FormKey, string>>
  lineItems: LineItemsByCategory<CategoryId>
  totalAmountKey: NoInfer<FormKey>
  requireInvoiceTotal?: boolean
  reconcileAllocationToTotal?: boolean
}): DerivedAllocationState<CategoryId, Category> {
  const categoryAmounts = categories.map((category) => {
    const itemAmount = (lineItems[category.id] ?? []).reduce(
      (sum, item) => sum + parseAmount(item.amount),
      0,
    )
    const amount = itemAmount === 0 ? parseAmount(form[category.amountKey]) : itemAmount
    return { ...category, amount }
  })

  const allocationSum = categoryAmounts.reduce((sum, category) => sum + category.amount, 0)
  const totalAmount = parseAmount(form[totalAmountKey])
  const hasInvoiceTotal = requireInvoiceTotal ? totalAmount > 0 : true
  const percentageBase = allocationSum > 0 ? allocationSum : totalAmount
  const percentages = Object.fromEntries(
    categoryAmounts.map((category) => [
      category.id,
      pctFromAmount(category.amount, percentageBase),
    ]),
  ) as Record<CategoryId, number>

  return {
    categoryAmounts,
    allocationSum,
    totalAmount,
    hasInvoiceTotal,
    allocationValid: reconcileAllocationToTotal
      ? hasInvoiceTotal && Math.abs(allocationSum - totalAmount) < 0.01
      : allocationSum > 0,
    remaining: hasInvoiceTotal ? totalAmount - allocationSum : 0,
    segments: categoryAmounts.map((category) => ({
      label: category.label,
      amount: category.amount,
      pct: percentages[category.id],
      className: category.barClass,
    })),
    percentages,
  }
}

export function updateLineItem(
  items: readonly LineItem[],
  index: number,
  fields: Partial<LineItem>,
): LineItem[] {
  return items.map((item, itemIndex) =>
    itemIndex === index ? { ...item, ...fields } : item,
  )
}

export function addLineItem(items: readonly LineItem[], defaultNaics: string): LineItem[] {
  return [...items, { amount: '', naics: defaultNaics }]
}

export function removeLineItem(items: readonly LineItem[], index: number): LineItem[] {
  if (items.length <= 1) return items.slice()
  return items.filter((_, itemIndex) => itemIndex !== index)
}

export function buildTransportCalculationRequest({
  weight,
  origin,
  portOfLoading,
  portOfDischarge,
  mode,
  matchedPort,
  allowEstimate = false,
}: TransportCalculationFields): TransportCalculationValidation {
  const normalizedWeight = Number(weight)
  if (!Number.isFinite(normalizedWeight) || normalizedWeight <= 0) {
    return { ok: false, error: TRANSPORT_VALIDATION_ERRORS.weight }
  }

  const normalizedOrigin = origin.trim()
  if (!normalizedOrigin) {
    return { ok: false, error: TRANSPORT_VALIDATION_ERRORS.origin }
  }

  const normalizedLoadingPort = portOfLoading.trim()
  if (!normalizedLoadingPort) {
    return { ok: false, error: TRANSPORT_VALIDATION_ERRORS.loadingPort }
  }

  const normalizedDischargePort = portOfDischarge.trim()
  if (!normalizedDischargePort) {
    return { ok: false, error: TRANSPORT_VALIDATION_ERRORS.dischargePort }
  }

  return {
    ok: true,
    request: {
      origin_country: matchedPort?.country ?? normalizedOrigin,
      port_of_loading: normalizedLoadingPort,
      port_of_discharge: normalizedDischargePort,
      weight_kg: normalizedWeight,
      transport_mode: mode,
      allow_estimate: allowEstimate,
    },
  }
}
