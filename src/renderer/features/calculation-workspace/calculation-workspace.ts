import {
  parseAmount,
  type AllocationCategoryInput,
  type LineItem,
} from './calculation-workflow.ts'

export interface CalculationWorkspaceCategory<
  CategoryId extends string,
  FormKey extends string,
> extends AllocationCategoryInput<CategoryId, FormKey> {
  naicsKey: FormKey
  defaultNaics: string
}

export type WorkspaceLineItems<CategoryId extends string> = Record<
  CategoryId,
  LineItem[]
>

export interface RequestGate {
  begin: () => number
  invalidate: () => void
  isCurrent: (requestId: number) => boolean
}

export function createRequestGate(): RequestGate {
  let revision = 0
  return {
    begin() {
      revision += 1
      return revision
    },
    invalidate() {
      revision += 1
    },
    isCurrent(requestId) {
      return requestId === revision
    },
  }
}

export function applyAllocationPreset<
  CategoryId extends string,
  FormKey extends string,
  Category extends CalculationWorkspaceCategory<CategoryId, FormKey>,
>({
  categories,
  form,
  lineItems,
  totalAmountKey,
  percentages,
}: {
  categories: readonly Category[]
  form: Readonly<Record<FormKey, string>>
  lineItems: Readonly<WorkspaceLineItems<CategoryId>>
  totalAmountKey: NoInfer<FormKey>
  percentages: Readonly<Record<CategoryId, number>>
}): {
  form: Record<FormKey, string>
  lineItems: WorkspaceLineItems<CategoryId>
} {
  const total = parseAmount(form[totalAmountKey])
  const nextForm = { ...form } as Record<FormKey, string>
  const nextLineItems = { ...lineItems } as WorkspaceLineItems<CategoryId>
  let allocated = 0

  categories.forEach((category, index) => {
    const isLast = index === categories.length - 1
    const amount = isLast
      ? Number((total - allocated).toFixed(2))
      : Number(((total * percentages[category.id]) / 100).toFixed(2))
    allocated += amount
    const amountText = String(amount)
    const selectedNaics =
      lineItems[category.id]?.[0]?.naics ||
      form[category.naicsKey] ||
      category.defaultNaics

    nextForm[category.amountKey] = amountText
    nextLineItems[category.id] = [{ amount: amountText, naics: selectedNaics }]
  })

  return { form: nextForm, lineItems: nextLineItems }
}
