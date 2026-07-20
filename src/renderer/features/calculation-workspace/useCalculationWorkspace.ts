import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type {
  EcoTransitResponse,
  NaicsOption,
} from '../../../shared/calculator-types.ts'
import { naicsCatalogByCode } from '../../../shared/naics-catalog.ts'
import {
  addLineItem,
  buildTransportCalculationRequest,
  deriveAllocationState,
  removeLineItem,
  updateLineItem,
  type TransportCalculationRequest,
  type TransportMode,
} from './calculation-workflow.ts'
import {
  applyAllocationPreset,
  createRequestGate,
  type CalculationWorkspaceCategory,
  type WorkspaceLineItems,
} from './calculation-workspace.ts'

export interface WorkspaceTransportPort {
  country: string
  loadingPorts: string[]
  intermediatePorts: string[]
}

export interface WorkspaceTransportState {
  weight: string
  origin: string
  portOfLoading: string
  portOfDischarge: string
  mode: TransportMode
  allowEstimate: boolean
  result: EcoTransitResponse | null
}

interface ReplaceWorkspaceOptions<
  FormKey extends string,
  CategoryId extends string,
  Result,
> {
  form: Record<FormKey, string>
  lineItems: WorkspaceLineItems<CategoryId>
  transport?: WorkspaceTransportState
  result?: Result | null
}

export function useCalculationWorkspace<
  FormKey extends string,
  CategoryId extends string,
  Category extends CalculationWorkspaceCategory<CategoryId, FormKey>,
  Result,
>({
  initialForm,
  categories,
  initialLineItems,
  totalAmountKey,
  requireInvoiceTotal = true,
  reconcileAllocationToTotal = true,
  initialTransport,
  transportPorts,
  loadNaicsOptions,
  calculateTransport,
  clearHistoryWarning,
  formatCalculationError = (error) =>
    error instanceof Error ? error.message : 'Calculation failed.',
}: {
  initialForm: Record<FormKey, string>
  categories: readonly Category[]
  initialLineItems: WorkspaceLineItems<CategoryId>
  totalAmountKey: NoInfer<FormKey>
  requireInvoiceTotal?: boolean
  reconcileAllocationToTotal?: boolean
  initialTransport: Omit<WorkspaceTransportState, 'result'>
  transportPorts: readonly WorkspaceTransportPort[]
  loadNaicsOptions: () => Promise<NaicsOption[]>
  calculateTransport: (
    request: TransportCalculationRequest,
  ) => Promise<EcoTransitResponse>
  clearHistoryWarning?: () => void
  formatCalculationError?: (error: unknown) => string
}) {
  const [form, setForm] = useState<Record<FormKey, string>>(() => ({ ...initialForm }))
  const [lineItems, setLineItems] = useState<WorkspaceLineItems<CategoryId>>(() =>
    cloneLineItems(initialLineItems),
  )
  const [naicsOptions, setNaicsOptions] = useState<NaicsOption[]>([])
  const [naicsError, setNaicsError] = useState<string | null>(null)

  const [result, setResult] = useState<Result | null>(null)
  const [calculationLoading, setCalculationLoading] = useState(false)
  const [calculationError, setCalculationError] = useState<string | null>(null)
  const calculationGate = useRef(createRequestGate())

  const [transportWeight, setTransportWeightState] = useState(initialTransport.weight)
  const [transportOrigin, setTransportOriginState] = useState(initialTransport.origin)
  const [transportPortOfLoading, setTransportPortOfLoadingState] = useState(
    initialTransport.portOfLoading,
  )
  const [transportPortOfDischarge, setTransportPortOfDischargeState] = useState(
    initialTransport.portOfDischarge,
  )
  const [transportMode, setTransportModeState] = useState<TransportMode>(
    initialTransport.mode,
  )
  const [allowTransportEstimate, setAllowTransportEstimateState] = useState(
    initialTransport.allowEstimate,
  )
  const [transportResult, setTransportResult] = useState<EcoTransitResponse | null>(null)
  const [transportLoading, setTransportLoading] = useState(false)
  const [transportError, setTransportError] = useState<string | null>(null)
  const transportGate = useRef(createRequestGate())

  useEffect(() => {
    let cancelled = false
    void loadNaicsOptions()
      .then((options) => {
        if (!cancelled) {
          setNaicsOptions(options)
          setNaicsError(null)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setNaicsOptions([])
          setNaicsError(error instanceof Error ? error.message : String(error))
        }
      })
    return () => {
      cancelled = true
    }
  }, [loadNaicsOptions])

  const selectedTransportPort = useMemo(
    () =>
      transportPorts.find(
        (item) =>
          item.country.toLowerCase() === transportOrigin.trim().toLowerCase(),
      ),
    [transportOrigin, transportPorts],
  )

  useEffect(() => {
    const firstLoadingPort = selectedTransportPort?.loadingPorts[0]
    if (firstLoadingPort) setTransportPortOfLoadingState(firstLoadingPort)
  }, [selectedTransportPort])

  const allocation = useMemo(
    () =>
      deriveAllocationState({
        categories,
        form,
        lineItems,
        totalAmountKey,
        requireInvoiceTotal,
        reconcileAllocationToTotal,
      }),
    [
      categories,
      form,
      lineItems,
      reconcileAllocationToTotal,
      requireInvoiceTotal,
      totalAmountKey,
    ],
  )

  const naicsByCode = useMemo(
    () => naicsCatalogByCode(naicsOptions),
    [naicsOptions],
  )

  const invalidateCalculation = useCallback(() => {
    calculationGate.current.invalidate()
    setCalculationLoading(false)
    setResult(null)
    setCalculationError(null)
    clearHistoryWarning?.()
  }, [clearHistoryWarning])

  const prepareCalculation = useCallback(() => {
    setResult(null)
    setCalculationError(null)
    clearHistoryWarning?.()
  }, [clearHistoryWarning])

  const failCalculation = useCallback(
    (message: string) => {
      calculationGate.current.invalidate()
      setCalculationLoading(false)
      setResult(null)
      setCalculationError(message)
      clearHistoryWarning?.()
    },
    [clearHistoryWarning],
  )

  const runCalculation = useCallback(
    async (
      calculate: () => Promise<Result>,
      onSuccess?: (response: Result) => void | Promise<void>,
    ): Promise<Result | null> => {
      const requestId = calculationGate.current.begin()
      setResult(null)
      setCalculationError(null)
      setCalculationLoading(true)
      clearHistoryWarning?.()

      try {
        const response = await calculate()
        if (!calculationGate.current.isCurrent(requestId)) return null
        setResult(response)
        await onSuccess?.(response)
        return calculationGate.current.isCurrent(requestId) ? response : null
      } catch (error) {
        if (calculationGate.current.isCurrent(requestId)) {
          setCalculationError(formatCalculationError(error))
        }
        return null
      } finally {
        if (calculationGate.current.isCurrent(requestId)) {
          setCalculationLoading(false)
        }
      }
    },
    [clearHistoryWarning, formatCalculationError],
  )

  const invalidateTransport = useCallback(() => {
    transportGate.current.invalidate()
    setTransportLoading(false)
    setTransportResult(null)
    setTransportError(null)
    invalidateCalculation()
  }, [invalidateCalculation])

  const updateField = useCallback(
    (key: FormKey, value: string) => {
      setForm((current) => ({ ...current, [key]: value }))
      invalidateCalculation()
    },
    [invalidateCalculation],
  )

  const updateItem = useCallback(
    (categoryId: CategoryId, index: number, fields: Partial<{ amount: string; naics: string }>) => {
      setLineItems((current) => ({
        ...current,
        [categoryId]: updateLineItem(current[categoryId], index, fields),
      }))
      invalidateCalculation()
    },
    [invalidateCalculation],
  )

  const addItem = useCallback(
    (categoryId: CategoryId) => {
      const category = categories.find((item) => item.id === categoryId)
      if (!category) return
      setLineItems((current) => ({
        ...current,
        [categoryId]: addLineItem(current[categoryId], category.defaultNaics),
      }))
      invalidateCalculation()
    },
    [categories, invalidateCalculation],
  )

  const removeItem = useCallback(
    (categoryId: CategoryId, index: number) => {
      setLineItems((current) => ({
        ...current,
        [categoryId]: removeLineItem(current[categoryId], index),
      }))
      invalidateCalculation()
    },
    [invalidateCalculation],
  )

  const applyPreset = useCallback(
    (percentages: Record<CategoryId, number>) => {
      if (!allocation.hasInvoiceTotal) return false
      const next = applyAllocationPreset({
        categories,
        form,
        lineItems,
        totalAmountKey,
        percentages,
      })
      setForm(next.form)
      setLineItems(next.lineItems)
      invalidateCalculation()
      return true
    },
    [
      allocation.hasInvoiceTotal,
      categories,
      form,
      invalidateCalculation,
      lineItems,
      totalAmountKey,
    ],
  )

  const distributeEqually = useCallback(() => {
    const equalShare = 100 / categories.length
    return applyPreset(
      Object.fromEntries(
        categories.map((category) => [category.id, equalShare]),
      ) as Record<CategoryId, number>,
    )
  }, [applyPreset, categories])

  const setTransportWeight = useCallback(
    (value: string) => {
      setTransportWeightState(value)
      invalidateTransport()
    },
    [invalidateTransport],
  )
  const setTransportOrigin = useCallback(
    (value: string) => {
      setTransportOriginState(value)
      invalidateTransport()
    },
    [invalidateTransport],
  )
  const setTransportPortOfLoading = useCallback(
    (value: string) => {
      setTransportPortOfLoadingState(value)
      invalidateTransport()
    },
    [invalidateTransport],
  )
  const setTransportPortOfDischarge = useCallback(
    (value: string) => {
      setTransportPortOfDischargeState(value)
      invalidateTransport()
    },
    [invalidateTransport],
  )
  const setTransportMode = useCallback(
    (value: TransportMode) => {
      setTransportModeState(value)
      invalidateTransport()
    },
    [invalidateTransport],
  )
  const setAllowTransportEstimate = useCallback(
    (value: boolean) => {
      setAllowTransportEstimateState(value)
      invalidateTransport()
    },
    [invalidateTransport],
  )

  const resetTransport = useCallback(() => {
    transportGate.current.invalidate()
    setTransportWeightState(initialTransport.weight)
    setTransportOriginState(initialTransport.origin)
    setTransportPortOfLoadingState(initialTransport.portOfLoading)
    setTransportPortOfDischargeState(initialTransport.portOfDischarge)
    setTransportModeState(initialTransport.mode)
    setAllowTransportEstimateState(initialTransport.allowEstimate)
    setTransportLoading(false)
    setTransportResult(null)
    setTransportError(null)
    invalidateCalculation()
  }, [initialTransport, invalidateCalculation])

  const runTransportCalculation = useCallback(async () => {
    transportGate.current.invalidate()
    setTransportLoading(false)
    setTransportError(null)
    setTransportResult(null)
    invalidateCalculation()

    const validation = buildTransportCalculationRequest({
      weight: transportWeight,
      origin: transportOrigin,
      portOfLoading: transportPortOfLoading,
      portOfDischarge: transportPortOfDischarge,
      mode: transportMode,
      matchedPort: selectedTransportPort,
      allowEstimate: allowTransportEstimate,
    })
    if (!validation.ok) {
      setTransportError(validation.error)
      return null
    }

    const requestId = transportGate.current.begin()
    setTransportLoading(true)
    try {
      const response = await calculateTransport(validation.request)
      if (!transportGate.current.isCurrent(requestId)) return null
      setTransportResult(response)
      return response
    } catch (error) {
      if (transportGate.current.isCurrent(requestId)) {
        setTransportError(error instanceof Error ? error.message : String(error))
      }
      return null
    } finally {
      if (transportGate.current.isCurrent(requestId)) setTransportLoading(false)
    }
  }, [
    allowTransportEstimate,
    calculateTransport,
    invalidateCalculation,
    selectedTransportPort,
    transportMode,
    transportOrigin,
    transportPortOfDischarge,
    transportPortOfLoading,
    transportWeight,
  ])

  const replaceWorkspace = useCallback(
    (next: ReplaceWorkspaceOptions<FormKey, CategoryId, Result>) => {
      calculationGate.current.invalidate()
      transportGate.current.invalidate()
      setForm({ ...next.form })
      setLineItems(cloneLineItems(next.lineItems))
      setResult(next.result ?? null)
      setCalculationLoading(false)
      setCalculationError(null)

      const transport = next.transport ?? { ...initialTransport, result: null }
      setTransportWeightState(transport.weight)
      setTransportOriginState(transport.origin)
      setTransportPortOfLoadingState(transport.portOfLoading)
      setTransportPortOfDischargeState(transport.portOfDischarge)
      setTransportModeState(transport.mode)
      setAllowTransportEstimateState(transport.allowEstimate)
      setTransportResult(transport.result)
      setTransportLoading(false)
      setTransportError(null)
      clearHistoryWarning?.()
    },
    [clearHistoryWarning, initialTransport],
  )

  const resetWorkspace = useCallback(() => {
    replaceWorkspace({
      form: initialForm,
      lineItems: initialLineItems,
      transport: { ...initialTransport, result: null },
      result: null,
    })
  }, [initialForm, initialLineItems, initialTransport, replaceWorkspace])

  return {
    form,
    lineItems,
    allocation,
    naicsOptions,
    naicsError,
    naicsByCode,
    updateField,
    updateItem,
    addItem,
    removeItem,
    applyPreset,
    distributeEqually,
    replaceWorkspace,
    resetWorkspace,
    calculation: {
      result,
      loading: calculationLoading,
      error: calculationError,
      invalidate: invalidateCalculation,
      prepare: prepareCalculation,
      fail: failCalculation,
      run: runCalculation,
    },
    transport: {
      weight: transportWeight,
      origin: transportOrigin,
      portOfLoading: transportPortOfLoading,
      portOfDischarge: transportPortOfDischarge,
      mode: transportMode,
      allowEstimate: allowTransportEstimate,
      result: transportResult,
      loading: transportLoading,
      error: transportError,
      selectedPort: selectedTransportPort,
      setWeight: setTransportWeight,
      setOrigin: setTransportOrigin,
      setPortOfLoading: setTransportPortOfLoading,
      setPortOfDischarge: setTransportPortOfDischarge,
      setMode: setTransportMode,
      setAllowEstimate: setAllowTransportEstimate,
      invalidate: invalidateTransport,
      reset: resetTransport,
      run: runTransportCalculation,
    },
  }
}

function cloneLineItems<CategoryId extends string>(
  lineItems: Readonly<WorkspaceLineItems<CategoryId>>,
): WorkspaceLineItems<CategoryId> {
  return Object.fromEntries(
    Object.entries(lineItems).map(([categoryId, items]) => [
      categoryId,
      (items as Array<{ amount: string; naics: string }>).map((item) => ({ ...item })),
    ]),
  ) as WorkspaceLineItems<CategoryId>
}
