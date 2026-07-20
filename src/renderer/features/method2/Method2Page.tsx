import { useEffect, useMemo, useState } from 'react'
import type React from 'react'
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  Calculator,
  CloudUpload,
  Database,
  Factory,
  FileText,
  Layers,
  Loader2,
  MessageCircle,
  Paintbrush,
  Plus,
  RotateCw,
  Route,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { AppBackground } from '@/components/AppBackground'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  calculateEcoTransitTransport,
  calculateMethod2,
  fetchNaicsOptions,
  fetchMethod2Machines,
  type Method2CalculateRequest,
  type Method2CalculateResponse,
  type Method2MachineReference,
} from '@/lib/calculator-api'
import {
  METHOD1_CATEGORIES,
  Method1SpendInputSections,
  Method1StepIndicator,
  Method1TransportationSection,
  PORT_OF_DISCHARGE,
  TRANSPORT_PORTS,
  currency,
  parseAmount,
  type CategoryId,
  type LineItem,
  type Method1FormKey,
} from '@/features/calculation-workspace/CalculationSharedInputs'
import { cn } from '@/lib/utils'
import { createMethod2WorkspaceId } from './rag-workspace'
import { toCalculationHistoryTransport } from '@/features/calculation-history/calculation-history'
import {
  isSupportedCalculationYear,
  MAX_CALCULATION_YEAR,
  MIN_CALCULATION_YEAR,
} from '@/features/calculation-workspace/calculation-workflow'
import { useCalculationHistorySave } from '@/features/calculation-history/useCalculationHistorySave'
import { useMethod2Chat } from './useMethod2Chat'
import { useMethod2Documents } from './useMethod2Documents'
import { useCalculationWorkspace } from '@/features/calculation-workspace/useCalculationWorkspace'
import {
  createMethod2ResultProjection,
  type Method2ResultProjection,
} from '@/features/result-projection/result-projection'

type MachiningRow = {
  id: string
  machineType: string
  dutyLevel: string
  operatingHours: string
}

type MachiningElectricityResult = {
  entries: Array<{
    id: string
    machineType: string
    dutyLevel: string
    operatingHours: number
    avgKW: number
    hourlyEmission: number
    emissions: number
  }>
  total: number
}

type ComponentView = {
  id: string
  label: string
  description: string
  icon: LucideIcon
  source: string
  formula: string
  valueKg: number
  confidence: 'Primary' | 'Estimated'
  rowClass: string
  barClass: string
  textClass: string
  details: { label: string; value: string }[]
}

const kg = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

const demoPart = {
  partId: 'M2-DEMO-001',
  partName: 'Precision aluminium bracket',
  supplier: 'Singapore PE supplier',
  year: 2024,
  material: 'Aluminium 6061 block',
  weightKg: 12.5,
  rawMaterialCostSgd: 820,
  surfaceTreatmentCostSgd: 360,
  rawMaterialNaics: '331315',
  surfaceTreatmentNaics: '332812',
}

const defaultSpendForm: Record<Method1FormKey, string> = {
  invoice_id: demoPart.partId,
  year: String(demoPart.year),
  total_amount_sgd: String(demoPart.rawMaterialCostSgd + 0 + demoPart.surfaceTreatmentCostSgd),
  raw_material_sgd: String(demoPart.rawMaterialCostSgd),
  fabrication_sgd: '0',
  surface_treatment_sgd: String(demoPart.surfaceTreatmentCostSgd),
  naics_raw_material: demoPart.rawMaterialNaics,
  naics_fabrication: '332710',
  naics_surface_treatment: demoPart.surfaceTreatmentNaics,
}

const METHOD2_SPEND_CATEGORIES: CategoryId[] = ['raw', 'surface']
const METHOD2_CATEGORIES = METHOD1_CATEGORIES.filter((category) =>
  METHOD2_SPEND_CATEGORIES.includes(category.id),
)

const initialLineItems: Record<CategoryId, LineItem[]> = {
  raw: [{ amount: defaultSpendForm.raw_material_sgd, naics: defaultSpendForm.naics_raw_material }],
  fabrication: [{ amount: defaultSpendForm.fabrication_sgd, naics: defaultSpendForm.naics_fabrication }],
  surface: [{ amount: defaultSpendForm.surface_treatment_sgd, naics: defaultSpendForm.naics_surface_treatment }],
}

const initialTransport = {
  weight: String(demoPart.weightKg),
  origin: 'Malaysia',
  portOfLoading: 'Port Klang',
  portOfDischarge: PORT_OF_DISCHARGE,
  mode: 'sea' as const,
  allowEstimate: false,
}

const requiredDocuments = [
  'Supplier PCF, EPD, or raw material carbon factor',
  'Transport origin, distance, mode, and material weight',
  'Annual electricity use, machine hours, or machining cost pool',
  'Surface treatment supplier disclosure or process factor',
]

function buildComponents(projection: Method2ResultProjection | null, transportSummary: string): ComponentView[] {
  const emissionsByKey = new Map(
    projection?.categories.map((category) => [category.key, category.emissions]) ?? [],
  )
  const rawMaterial = projection?.spendCategories.find((category) => category.key === 'raw_material')
  const surfaceTreatment = projection?.spendCategories.find((category) => category.key === 'surface_treatment')
  const machiningEntry = projection?.machining.entries[0]
  const transportSource = projection?.transport.source ?? 'Not calculated'
  const transportEstimated = transportSource.toLowerCase().includes('estimate')

  return [
    {
      id: 'metal',
      label: 'Raw material',
      description: 'Upstream metal or block production before machining.',
      icon: Layers,
      source: 'Authoritative NAICS reference database',
      formula: 'Cost -> FX -> GDP deflator -> NAICS factor -> emissions',
      valueKg: emissionsByKey.get('raw_material') ?? 0,
      confidence: 'Primary',
      rowClass: 'border-lime-400/20 bg-lime-400/[0.04]',
      barClass: 'bg-lime-400',
      textClass: 'text-lime-700',
      details: [
        { label: 'NAICS proxy', value: rawMaterial?.naicsCode ?? 'Not calculated' },
        { label: 'Cost basis', value: currency.format(rawMaterial?.amountSgd ?? 0) },
        { label: 'Reuse', value: 'Method 1 compute_emissions' },
      ],
    },
    {
      id: 'transport',
      label: 'Transportation',
      description: 'EcoTransit transport emissions copied from Method 1 behavior.',
      icon: Route,
      source: transportSource,
      formula: 'Existing Method 1 /ecotransit implementation',
      valueKg: emissionsByKey.get('transportation') ?? 0,
      confidence: transportEstimated ? 'Estimated' : 'Primary',
      rowClass: 'border-sky-400/20 bg-sky-400/[0.04]',
      barClass: 'bg-sky-400',
      textClass: 'text-sky-700',
      details: [
        { label: 'Result', value: transportSummary },
        { label: 'Destination', value: 'Singapore' },
        { label: 'Reuse', value: 'Method 1 EcoTransit endpoint' },
      ],
    },
    {
      id: 'machining',
      label: 'Machining electricity',
      description: 'Machine hourly emission factor multiplied by operating hours.',
      icon: Factory,
      source: machiningEntry?.dataSource ?? 'Method 2 reference database',
      formula: 'Hourly emission factor x operating hours',
      valueKg: emissionsByKey.get('machining') ?? 0,
      confidence: 'Primary',
      rowClass: 'border-teal-400/20 bg-teal-400/[0.04]',
      barClass: 'bg-teal-400',
      textClass: 'text-teal-700',
      details: [
        { label: 'Machine', value: machiningEntry ? `${machiningEntry.machineType} / ${machiningEntry.dutyLevel}` : 'Not calculated' },
        { label: 'Hourly factor', value: machiningEntry ? `${machiningEntry.hourlyEmission} kg CO2e/hr` : 'Select machine' },
        { label: 'Grid source', value: machiningEntry?.gridSource ?? 'Not calculated' },
      ],
    },
    {
      id: 'surface',
      label: 'Surface treatment',
      description: 'Anodizing, plating, heat treatment, polishing, or coating.',
      icon: Paintbrush,
      source: 'Authoritative NAICS reference database',
      formula: 'Cost -> FX -> GDP deflator -> NAICS factor -> emissions',
      valueKg: emissionsByKey.get('surface_treatment') ?? 0,
      confidence: 'Primary',
      rowClass: 'border-rose-400/20 bg-rose-400/[0.04]',
      barClass: 'bg-rose-400',
      textClass: 'text-rose-700',
      details: [
        { label: 'NAICS proxy', value: surfaceTreatment?.naicsCode ?? 'Not calculated' },
        { label: 'Cost basis', value: currency.format(surfaceTreatment?.amountSgd ?? 0) },
        { label: 'Reuse', value: 'Method 1 compute_emissions' },
      ],
    },
  ]
}

function ResultsPanel({
  components,
  projection,
}: {
  components: ComponentView[]
  projection: Method2ResultProjection | null
}) {
  const total = projection?.totals.reportedEmissions ?? 0
  const max = Math.max(...components.map((item) => item.valueKg), 1)

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-lime-300/30 bg-gradient-to-br from-lime-500/15 via-white/80 to-teal-500/10 p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-lime-700/80">Method 2 total emissions</p>
        <p className="mt-1 font-mono text-4xl font-semibold tracking-tight text-zinc-950 tabular-nums">
          {kg.format(total)}
          <span className="ml-2 text-lg font-normal text-lime-700/90">kg CO2e</span>
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-zinc-900/12 bg-zinc-950/5 px-2.5 py-1 font-mono text-lime-800">
            {projection?.documentId ?? demoPart.partId}
          </span>
          <span className="rounded-full border border-zinc-900/12 bg-zinc-950/5 px-2.5 py-1 text-muted-foreground">
            {projection?.transportWeightKg ?? demoPart.weightKg} kg material - {projection?.year ?? demoPart.year}
          </span>
        </div>
      </div>

      <div>
        <p className="mb-3 text-sm font-medium text-muted-foreground">Component breakdown</p>
        <div className="space-y-3">
          {components.map((item) => {
            const Icon = item.icon
            const width = (item.valueKg / max) * 100

            return (
              <div key={item.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon className={cn('size-4 shrink-0', item.textClass)} />
                    <span className="truncate">{item.label}</span>
                  </span>
                  <span className={cn('shrink-0 font-mono tabular-nums', item.textClass)}>
                    {kg.format(item.valueKg)} kg
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-zinc-900/10">
                  <div className={cn('h-full rounded-full transition-all duration-500', item.barClass)} style={{ width: `${width}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function Method2Page({ onHistorySaved }: { onHistorySaved?: () => void }) {
  const [workspaceId] = useState(createMethod2WorkspaceId)
  const [machineLibrary, setMachineLibrary] = useState<Method2MachineReference[]>([])
  const [machineLibraryError, setMachineLibraryError] = useState<string | null>(null)
  const [rows, setRows] = useState<MachiningRow[]>([
    { id: 'machine-1', machineType: 'CNC Milling', dutyLevel: 'Medium', operatingHours: '5' },
  ])
  const [machiningResult, setMachiningResult] = useState<MachiningElectricityResult | null>(null)
  const [machiningError, setMachiningError] = useState<string | null>(null)
  const [resultRequest, setResultRequest] = useState<Method2CalculateRequest | null>(null)
  const {
    historyWarning,
    clearHistoryWarning,
    saveCalculationHistory,
  } = useCalculationHistorySave(onHistorySaved)

  const workspace = useCalculationWorkspace<Method1FormKey, CategoryId, (typeof METHOD2_CATEGORIES)[number], Method2CalculateResponse>({
    initialForm: defaultSpendForm,
    categories: METHOD2_CATEGORIES,
    initialLineItems,
    totalAmountKey: 'total_amount_sgd',
    requireInvoiceTotal: false,
    reconcileAllocationToTotal: false,
    initialTransport,
    transportPorts: TRANSPORT_PORTS,
    loadNaicsOptions: fetchNaicsOptions,
    calculateTransport: calculateEcoTransitTransport,
    clearHistoryWarning,
    formatCalculationError: (caught) => caught instanceof Error ? caught.message : String(caught),
  })
  const { form, naicsOptions, naicsError, naicsByCode } = workspace
  const rawItems = workspace.lineItems.raw
  const fabItems = workspace.lineItems.fabrication
  const surfaceItems = workspace.lineItems.surface
  const {
    allocationSum,
    totalAmount: totalSgd,
    hasInvoiceTotal,
    allocationValid,
    remaining,
    segments: allocationSegments,
    percentages: allocationPercentages,
  } = workspace.allocation
  const {
    result,
    loading: calculateLoading,
    error,
  } = workspace.calculation
  const {
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
  } = workspace.transport

  useEffect(() => {
    void fetchMethod2Machines()
      .then((machines) => {
        setMachineLibrary(machines)
        setMachineLibraryError(null)
      })
      .catch((error) => {
        setMachineLibrary([])
        setMachineLibraryError(error instanceof Error ? error.message : String(error))
      })
  }, [])

  useEffect(() => {
    if (machineLibrary.length === 0) return

    setRows((current) =>
      current.map((row) => {
        const hasMachineType = machineLibrary.some((machine) => machine.machineType === row.machineType)
        const machineType = hasMachineType ? row.machineType : machineLibrary[0].machineType
        const dutyLevels = machineLibrary.filter((machine) => machine.machineType === machineType)
        const hasDutyLevel = dutyLevels.some((machine) => machine.dutyLevel === row.dutyLevel)

        return {
          ...row,
          machineType,
          dutyLevel: hasDutyLevel ? row.dutyLevel : dutyLevels[0]?.dutyLevel ?? '',
        }
      }),
    )
  }, [machineLibrary])

  const machineTypes = useMemo(
    () => Array.from(new Set(machineLibrary.map((machine) => machine.machineType))),
    [machineLibrary],
  )

  const transportSummary = useMemo(() => {
    if (!transportResult) return 'No transport calculation yet'
    const emissions = transportResult.transport.chosen_emissions_kg ?? 0
    return `${kg.format(emissions)} kg CO2e via ${transportResult.transport.chosen_mode}`
  }, [transportResult])

  const resultProjection = useMemo(
    () => result && resultRequest
      ? createMethod2ResultProjection({
          result,
          request: resultRequest,
          transport: transportResult?.transport,
        })
      : null,
    [result, resultRequest, transportResult],
  )
  const components = useMemo(
    () => buildComponents(resultProjection, transportSummary),
    [resultProjection, transportSummary],
  )

  function invalidateMachiningResult() {
    setMachiningResult(null)
    setMachiningError(null)
  }

  const fixedContext = useMemo(() => {
    return {
      method: 'Method 2 hybrid calculation',
      part: {
        id: form.invoice_id.trim() || demoPart.partId,
        name: demoPart.partName,
        supplier: demoPart.supplier,
        material: demoPart.material,
        weight_kg: Number(transportWeight) || demoPart.weightKg,
        year: Number(form.year),
      },
      total_emissions_kg_co2e: resultProjection?.totals.reportedEmissions ?? 0,
      components: components.map((item) => ({
        label: item.label,
        emissions_kg_co2e: item.valueKg,
        confidence: item.confidence,
        source: item.source,
        formula: item.formula,
      })),
      transport: transportResult?.transport ?? null,
      missing_source_documents: requiredDocuments,
    }
  }, [components, form.invoice_id, form.year, resultProjection, transportResult, transportWeight])

  const {
    chatLoading,
    chatOpen,
    expandedCitation,
    input,
    messages,
    removeDocumentCitations,
    sendMessage,
    setChatOpen,
    setExpandedCitation,
    setInput,
  } = useMethod2Chat({
    workspaceId,
    calculationContext: fixedContext,
  })

  const {
    deleteDocument,
    documentError,
    documents,
    documentsLoading,
    fileInputRef,
    retryFiles,
    uploadDocuments,
    uploading,
  } = useMethod2Documents({
    workspaceId,
    onDocumentDeleted: removeDocumentCitations,
  })

  const updateField = workspace.updateField
  const updateItem = workspace.updateItem
  const addItem = workspace.addItem
  const removeItem = workspace.removeItem

  function applyAmountPreset(rawPct: number, fabPct: number, surfacePct: number) {
    workspace.applyPreset({ raw: rawPct, fabrication: fabPct, surface: surfacePct })
  }

  function applyDefaultSplit() {
    applyAmountPreset(50, 35, 15)
  }

  function distributeEqually() {
    workspace.distributeEqually()
  }

  async function handleTransportCalculate(event?: React.SyntheticEvent) {
    if (event) event.preventDefault()
    await workspace.transport.run()
  }

  function handleMachiningCalculate() {
    setMachiningError(null)

    const entries = rows.map((row, index) => {
      const ref = machineLibrary.find(
        (machine) => machine.machineType === row.machineType && machine.dutyLevel === row.dutyLevel,
      )
      if (!ref) {
        throw new Error(`Select a machine and duty level for machining row ${index + 1}.`)
      }

      const operatingHours = Number(row.operatingHours)
      if (!Number.isFinite(operatingHours) || operatingHours < 0) {
        throw new Error(`Enter valid operating hours for machining row ${index + 1}.`)
      }

      return {
        id: row.id,
        machineType: row.machineType,
        dutyLevel: row.dutyLevel,
        operatingHours,
        avgKW: ref.avgKW,
        hourlyEmission: ref.hourlyEmission,
        emissions: ref.hourlyEmission * operatingHours,
      }
    })

    setMachiningResult({
      entries,
      total: entries.reduce((sum, entry) => sum + entry.emissions, 0),
    })
  }

  async function handleCalculate() {
    workspace.calculation.prepare()

    if (!allocationValid) {
      workspace.calculation.fail('Enter at least one raw material or surface treatment amount before calculating Method 2.')
      return
    }

    if (!transportResult) {
      workspace.calculation.fail('Calculate transport before calculating Method 2 so transportation is included.')
      return
    }

    const rawSum = rawItems.reduce((sum, item) => sum + parseAmount(item.amount), 0) || parseAmount(form.raw_material_sgd)
    const surfSum = surfaceItems.reduce((sum, item) => sum + parseAmount(item.amount), 0) || parseAmount(form.surface_treatment_sgd)
    const year = Number(form.year)
    if (!isSupportedCalculationYear(year)) {
      workspace.calculation.fail(
        `Enter a valid assessment year from ${MIN_CALCULATION_YEAR} to ${MAX_CALCULATION_YEAR}.`,
      )
      return
    }

    const transportEmissions = transportResult?.transport?.chosen_emissions_kg ?? 0

    const calculationRequest = {
      part_id: form.invoice_id.trim() || demoPart.partId,
      year,
      raw_material_sgd: rawSum,
      surface_treatment_sgd: surfSum,
      naics: {
        raw_material: (rawItems[0]?.naics ?? form.naics_raw_material).trim(),
        fabrication: (fabItems[0]?.naics ?? form.naics_fabrication).trim(),
        surface_treatment: (surfaceItems[0]?.naics ?? form.naics_surface_treatment).trim(),
      },
      transport_emissions_kg: transportEmissions,
      transport_source: transportResult.transport.source,
      machining_entries: rows.map((row) => ({
        machine_type: row.machineType,
        duty_level: row.dutyLevel,
        operating_hours: Number(row.operatingHours),
      })),
    }
    await workspace.calculation.run(
      () => calculateMethod2(calculationRequest),
      async (response) => {
        setResultRequest(calculationRequest)
        setMachiningResult({
          entries: response.machining.entries.map((entry, index) => ({
            id: rows[index]?.id ?? `machine-result-${index}`,
            machineType: entry.machineType,
            dutyLevel: entry.dutyLevel,
            operatingHours: entry.operatingHours,
            avgKW: entry.avgKW,
            hourlyEmission: entry.hourlyEmission,
            emissions: entry.emissions,
          })),
          total: response.machining.total,
        })
        setMachiningError(null)

        await saveCalculationHistory({
          method: 'method2',
          request: calculationRequest,
          result: response,
          transport: toCalculationHistoryTransport(transportResult),
        })
      },
    )
  }

  return (
    <AppBackground>
      <section className="relative z-10 mx-auto grid w-full max-w-[92rem] gap-4 pb-8 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <aside className="rounded-lg bg-zinc-950 p-4 text-white lg:sticky lg:top-4 lg:self-start">
          <Button variant="ghost" className="-ml-2 mb-8 text-zinc-300 hover:bg-white/10 hover:text-white" onClick={() => { window.location.hash = '' }}>
            <ArrowLeft />
            Back to workflows
          </Button>

          <div className="space-y-5">
            <div className="flex size-12 items-center justify-center rounded-md bg-lime-300 text-zinc-950">
              <MessageCircle className="size-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-lime-300">Activity data</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight">Method 2</h1>
            </div>
            <p className="text-sm leading-6 text-zinc-300">
              Hybrid emissions estimate using Method 1 spend logic, EcoTransit transport, and temporary machine-hour data.
            </p>
            <div className="mt-8 border-t border-white/10 pt-5">
              <Method1StepIndicator
                activeStep={2}
                steps={[
                  { id: 1, title: 'Cost inputs', description: 'Spend & NAICS' },
                  { id: 2, title: 'Hybrid model', description: 'Transport & machining' },
                  { id: 3, title: 'Review', description: 'Breakdown' },
                ]}
              />
            </div>
          </div>
        </aside>

        <div className="space-y-4">
          <main className="space-y-4">
            <div className="rounded-lg border border-zinc-900/12 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Method 2 workspace</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">Company-derived hybrid method</h2>
                </div>
                <Button onClick={handleCalculate} disabled={calculateLoading}>
                  {calculateLoading ? <Loader2 className="animate-spin" /> : <Calculator />}
                  Calculate Method 2
                </Button>
              </div>
              {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
              {naicsError ? (
                <div className="mt-3 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                  NAICS reference data unavailable: {naicsError}
                </div>
              ) : null}
              {historyWarning ? (
                <div
                  className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2.5 text-sm text-amber-900"
                  role="status"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{historyWarning}</span>
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.05fr)_minmax(21rem,0.95fr)]">
              <div className="space-y-4">
                <Method1SpendInputSections
                  form={form}
                  hasInvoiceTotal={hasInvoiceTotal}
                  totalSgd={totalSgd}
                  allocationSum={allocationSum}
                  allocationValid={allocationValid}
                  remaining={remaining}
                  allocationSegments={allocationSegments}
                  allocationPercentages={allocationPercentages}
                  naicsOptions={naicsOptions}
                  naicsByCode={naicsByCode}
                  rawItems={rawItems}
                  fabItems={fabItems}
                  surfaceItems={surfaceItems}
                  updateField={updateField}
                  updateItem={updateItem}
                  addItem={addItem}
                  removeItem={removeItem}
                  applyDefaultSplit={applyDefaultSplit}
                  distributeEqually={distributeEqually}
                  visibleCategories={METHOD2_SPEND_CATEGORIES}
                  showPresetButtons={false}
                  mergeInvoiceFieldsIntoAllocation
                  allocationTitle="Method 2 cost inputs"
                  allocationDescription="Enter assessment year, raw material cost, surface treatment cost, and NAICS codes."
                  allocationStepLabel="1"
                  showTotalAmount={false}
                  showAllocationSummary={false}
                  showShareColumn={false}
                  showYearInHeader={false}
                  showYearColumn
                  showAllocationStepBadge={false}
                  showNaicsFactorDetails
                />

                <Method1TransportationSection
                  transportWeight={transportWeight}
                  transportOrigin={transportOrigin}
                  transportPortOfLoading={transportPortOfLoading}
                  transportPortOfDischarge={transportPortOfDischarge}
                  transportMode={transportMode}
                  transportLoading={transportLoading}
                  transportError={transportError}
                  transportResult={transportResult}
                  allowTransportEstimate={allowTransportEstimate}
                  selectedTransportPort={selectedTransportPort}
                  setTransportWeight={workspace.transport.setWeight}
                  setTransportOrigin={workspace.transport.setOrigin}
                  setTransportPortOfLoading={workspace.transport.setPortOfLoading}
                  setTransportPortOfDischarge={workspace.transport.setPortOfDischarge}
                  setTransportMode={workspace.transport.setMode}
                  setAllowTransportEstimate={workspace.transport.setAllowEstimate}
                  resetTransport={workspace.transport.reset}
                  handleTransportCalculate={handleTransportCalculate}
                />

                <Card className="gap-0 overflow-hidden border-zinc-900/12 bg-white py-0 shadow-sm">
                  <CardHeader className="border-b border-zinc-900/10 bg-[#faf8f1] px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 items-center justify-center rounded-md bg-lime-300/80 text-zinc-950">
                          <Factory className="size-5" />
                        </span>
                        <div>
                          <CardTitle>Machining electricity</CardTitle>
                          <CardDescription>Machine and grid factors loaded from the Method 2 reference database.</CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            try {
                              handleMachiningCalculate()
                            } catch (err) {
                              setMachiningResult(null)
                              setMachiningError(err instanceof Error ? err.message : String(err))
                            }
                          }}
                        >
                          <Calculator />
                          Calculate
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            const machine = machineLibrary[0]
                            if (!machine) return
                            setRows((current) => [...current, { id: `machine-${Date.now()}`, machineType: machine.machineType, dutyLevel: machine.dutyLevel, operatingHours: '1' }])
                            invalidateMachiningResult()
                            workspace.calculation.invalidate()
                          }}
                          disabled={machineLibrary.length === 0}
                        >
                          <Plus />
                          Add
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 px-5 py-6">
                    {machineLibraryError ? (
                      <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                        Machine reference data unavailable: {machineLibraryError}
                      </div>
                    ) : null}
                    {rows.map((row) => {
                      const dutyLevels = machineLibrary
                        .filter((machine) => machine.machineType === row.machineType)
                        .map((machine) => machine.dutyLevel)
                      const ref = machineLibrary.find((machine) => machine.machineType === row.machineType && machine.dutyLevel === row.dutyLevel)

                      return (
                        <div key={row.id} className="grid gap-3 rounded-lg border border-zinc-900/12 bg-white/70 p-3 md:grid-cols-[1fr_1fr_1fr_auto]">
                          <div>
                            <Label>Machine Type</Label>
                            <Select
                              value={row.machineType}
                              onValueChange={(value) => {
                                setRows((current) => current.map((item) => item.id === row.id ? { ...item, machineType: value, dutyLevel: machineLibrary.find((machine) => machine.machineType === value)?.dutyLevel ?? '' } : item))
                                invalidateMachiningResult()
                                workspace.calculation.invalidate()
                              }}
                            >
                              <SelectTrigger><SelectValue placeholder="Select machine" /></SelectTrigger>
                              <SelectContent>
                                {machineTypes.map((machineType) => <SelectItem key={machineType} value={machineType}>{machineType}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Duty Level</Label>
                            <Select
                              value={row.dutyLevel}
                              onValueChange={(value) => {
                                setRows((current) => current.map((item) => item.id === row.id ? { ...item, dutyLevel: value } : item))
                                invalidateMachiningResult()
                                workspace.calculation.invalidate()
                              }}
                            >
                              <SelectTrigger><SelectValue placeholder="Select duty" /></SelectTrigger>
                              <SelectContent>
                                {dutyLevels.map((dutyLevel) => <SelectItem key={dutyLevel} value={dutyLevel}>{dutyLevel}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Operating Hours</Label>
                            <Input
                              value={row.operatingHours}
                              onChange={(event) => {
                                setRows((current) => current.map((item) => item.id === row.id ? { ...item, operatingHours: event.target.value } : item))
                                invalidateMachiningResult()
                                workspace.calculation.invalidate()
                              }}
                            />
                            <p className="mt-1 text-xs text-muted-foreground">
                              {ref
                                ? `${kg.format(ref.hourlyEmission)} kg CO2e/hr, ${kg.format(ref.avgKW)} kW avg`
                                : 'Select reference'}
                            </p>
                          </div>
                          <div className="flex items-end">
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              onClick={() => {
                                setRows((current) => current.filter((item) => item.id !== row.id))
                                invalidateMachiningResult()
                                workspace.calculation.invalidate()
                              }}
                              disabled={rows.length === 1}
                              aria-label="Remove machining entry"
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </div>
                      )
                    })}

                    {machiningError ? (
                      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        {machiningError}
                      </div>
                    ) : null}

                    {machiningResult ? (
                      <div className="rounded-lg border border-zinc-900/12 bg-zinc-50 p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Machining result</p>
                            <p className="mt-1 text-2xl font-semibold text-zinc-950">{kg.format(machiningResult.total)} kg CO2e</p>
                          </div>
                          <p className="text-sm text-zinc-600">
                            {machiningResult.entries.length} {machiningResult.entries.length === 1 ? 'entry' : 'entries'} calculated
                          </p>
                        </div>
                        <div className="mt-3 divide-y divide-zinc-900/10 border-t border-zinc-900/10">
                          {machiningResult.entries.map((entry) => (
                            <div key={entry.id} className="grid gap-1 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                              <div className="min-w-0">
                                <p className="truncate font-medium text-zinc-950">{entry.machineType} / {entry.dutyLevel}</p>
                                <p className="text-xs text-zinc-500">
                                  {kg.format(entry.operatingHours)} hr x {kg.format(entry.hourlyEmission)} kg CO2e/hr, {kg.format(entry.avgKW)} kW avg
                                </p>
                              </div>
                              <p className="font-semibold text-zinc-950">{kg.format(entry.emissions)} kg CO2e</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="rounded-lg border border-lime-500/25 bg-lime-50 p-4">
                      <div className="flex items-start gap-3">
                        <Database className="mt-0.5 size-5 shrink-0 text-lime-700" />
                        <p className="text-sm leading-6 text-lime-950/80">
                          Machine equipment is loaded from the Method 2 database when available. Avg kW comes from `method2_machine_profiles`; kg CO2e/hr is avg kW multiplied by the latest SG grid factor from `method2_grid_electricity_factors`
                          {machineLibrary[0]?.gridFactor
                            ? ` (${kg.format(machineLibrary[0].gridFactor)} kg CO2e/kWh, ${machineLibrary[0].gridYear ?? 'latest'}).`
                            : '.'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

              </div>

              <aside className="space-y-4">
                <Card className="gap-0 overflow-hidden border-zinc-900/12 bg-white py-0 shadow-sm">
                  <CardHeader className="border-b border-zinc-900/10 bg-zinc-950 px-5 py-4 text-white">
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 items-center justify-center rounded-md bg-lime-300 text-zinc-950">
                        <Calculator className="size-5" />
                      </span>
                      <div className="min-w-0">
                        <CardTitle>Results</CardTitle>
                        <CardDescription className="text-zinc-300">Raw, transport, treatment, machining, and total.</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="px-5 py-6">
                    <ResultsPanel components={components} projection={resultProjection} />
                  </CardContent>
                </Card>

                <Card className="gap-0 overflow-hidden border-zinc-900/12 bg-white py-0 shadow-sm">
                  <CardHeader className="border-b border-zinc-900/10 bg-[#faf8f1] px-5 py-4">
                    <CardTitle>Calculation Process</CardTitle>
                    <CardDescription>Where each component comes from.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 px-5 py-6">
                    {components.map((item, index) => {
                      const Icon = item.icon
                      return (
                        <div key={item.id} className={cn('rounded-lg border p-4', item.rowClass)}>
                          <div className="flex items-start gap-3">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-white/70">
                              <Icon className={cn('size-5', item.textClass)} />
                            </span>
                            <div className="min-w-0">
                              <p className={cn('font-medium', item.textClass)}>Step {index + 1}: {item.label}</p>
                              <p className="mt-1 text-sm leading-5 text-muted-foreground">{item.formula}</p>
                            </div>
                          </div>
                          <div className="mt-4 grid gap-2 text-sm">
                            {item.details.map((detail) => (
                              <div key={detail.label} className="flex items-start justify-between gap-3 rounded-lg border border-zinc-900/12 bg-white/70 px-3 py-2">
                                <span className="text-muted-foreground">{detail.label}</span>
                                <span className="max-w-[65%] text-right font-mono text-xs text-foreground">{detail.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </CardContent>
                </Card>
              </aside>
            </div>
          </main>
        </div>

        <div className="fixed bottom-5 right-5 z-50 flex max-h-[calc(100vh-5.5rem)] flex-col items-end gap-3">
          {chatOpen ? (
            <Card className="w-[min(28rem,calc(100vw-2rem))] gap-0 overflow-hidden rounded-2xl border-zinc-900/12 bg-white py-0 shadow-2xl">
              <CardHeader className="border-b border-zinc-900/10 bg-zinc-950 px-5 py-4 text-white">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-lime-300 text-zinc-950">
                      <Bot className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <CardTitle>AI Assistant</CardTitle>
                      <CardDescription className="truncate text-zinc-300">Contextual help for Method 2.</CardDescription>
                    </div>
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="text-zinc-300 hover:bg-white/10 hover:text-white" onClick={() => setChatOpen(false)} aria-label="Close assistant">
                    <X />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex h-[min(32rem,calc(100vh-13rem))] flex-col p-0">
                <div className="border-b border-zinc-900/10 bg-[#faf8f1] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-lime-200 text-lime-950">
                        <Database className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-950">Supplier documents</p>
                        <p className="text-[11px] leading-4 text-muted-foreground">
                          Indexed locally; retrieved excerpts are sent to OpenAI.
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? <Loader2 className="animate-spin" /> : <CloudUpload />}
                      Upload
                    </Button>
                    <Input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.xlsx,.xls,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                      multiple
                      className="hidden"
                      onChange={(event) => {
                        void uploadDocuments(Array.from(event.target.files ?? []))
                      }}
                    />
                  </div>

                  <div className="mt-2 max-h-24 space-y-1 overflow-y-auto">
                    {documentsLoading ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" />
                        Loading document index
                      </div>
                    ) : documents.length === 0 ? (
                      <div className="rounded-md border border-dashed border-zinc-900/15 px-2.5 py-1.5 text-xs text-muted-foreground">
                        No supplier documents indexed.
                      </div>
                    ) : (
                      documents.map((document) => (
                        <div
                          key={document.document_id}
                          className="flex items-center gap-2 rounded-md border border-zinc-900/10 bg-white px-2 py-1.5"
                        >
                          <FileText className="size-3.5 shrink-0 text-lime-700" />
                          <span className="min-w-0 flex-1 truncate text-xs font-medium">
                            {document.filename}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {document.chunk_count}
                          </span>
                          <ShieldCheck className="size-3.5 shrink-0 text-teal-600" />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            title={`Delete ${document.filename}`}
                            aria-label={`Delete ${document.filename}`}
                            className="size-7 text-zinc-400 hover:bg-rose-50 hover:text-rose-700"
                            onClick={() => void deleteDocument(document.document_id)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>

                  {documentError ? (
                    <div className="mt-2 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs text-rose-800">
                      <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                      <span className="min-w-0 flex-1">{documentError}</span>
                      {retryFiles.length > 0 ? (
                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          className="h-auto shrink-0 gap-1 p-0 text-rose-800"
                          onClick={() => void uploadDocuments(retryFiles)}
                          disabled={uploading}
                        >
                          <RotateCw className="size-3" />
                          Retry
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
                  {messages.length === 0 ? (
                    <div className="mx-auto mt-8 max-w-sm rounded-lg border border-dashed border-lime-300/35 bg-lime-300/[0.03] p-5 text-center text-sm leading-6 text-muted-foreground">
                      Upload supplier evidence, then ask a question. Answers show the excerpts used.
                    </div>
                  ) : (
                    messages.map((m, i) => (
                      <div key={i} className={`max-w-[88%] rounded-lg px-3 py-2 ${m.role === 'user' ? 'ml-auto bg-lime-100 text-zinc-950' : 'mr-auto bg-zinc-950 text-white'}`}>
                        <div className="whitespace-pre-wrap text-sm leading-6">{m.content}</div>
                        {m.role === 'assistant' && m.grounded === false ? (
                          <div className="mt-2 flex items-center gap-1.5 border-t border-white/10 pt-2 text-xs text-amber-200">
                            <AlertCircle className="size-3.5" />
                            No supporting document found
                          </div>
                        ) : null}
                        {m.citations && m.citations.length > 0 ? (
                          <div className="mt-3 space-y-2 border-t border-white/10 pt-2">
                            <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                              Sources
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {m.citations.map((citation, citationIndex) => {
                                const citationKey = `${i}:${citationIndex}`
                                return (
                                  <Button
                                    key={citationKey}
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      setExpandedCitation((current) =>
                                        current === citationKey ? null : citationKey,
                                      )
                                    }
                                    className="h-auto whitespace-normal rounded-md border border-white/15 bg-white/10 px-2 py-1 text-left text-[11px] text-zinc-100 hover:bg-white/15 hover:text-white"
                                  >
                                    {citationIndex + 1}. {citation.filename} · {citation.location}
                                  </Button>
                                )
                              })}
                            </div>
                            {m.citations.map((citation, citationIndex) => {
                              const citationKey = `${i}:${citationIndex}`
                              return expandedCitation === citationKey ? (
                                <div
                                  key={citationKey}
                                  className="rounded-md border border-white/10 bg-white/[0.06] p-2.5 text-xs leading-5 text-zinc-200"
                                >
                                  <p className="mb-1 font-medium text-white">
                                    {citation.filename} · {citation.location}
                                  </p>
                                  <p>{citation.excerpt}</p>
                                  <p className="mt-1 font-mono text-[10px] text-zinc-400">
                                    Relevance {(citation.score * 100).toFixed(0)}%
                                  </p>
                                </div>
                              ) : null
                            })}
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                  {chatLoading ? (
                    <div className="mr-auto inline-flex items-center gap-2 rounded-lg bg-zinc-950 px-3 py-2 text-sm text-white">
                      <Loader2 className="size-4 animate-spin" />
                      Thinking
                    </div>
                  ) : null}
                </div>

                <form onSubmit={sendMessage} className="border-t border-zinc-900/10 bg-[#faf8f1] p-4">
                  <div className="flex gap-2">
                    <Input className="h-12" placeholder="Ask about Method 2..." value={input} onChange={(e) => setInput(e.target.value)} disabled={chatLoading} />
                    <Button type="submit" size="icon" disabled={chatLoading}>
                      {chatLoading ? <Loader2 className="animate-spin" /> : <Send />}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : null}

          <Button
            type="button"
            variant="outline"
            onClick={() => setChatOpen((value) => !value)}
            className="h-auto gap-3 rounded-full border-lime-300/70 bg-white px-4 py-3 text-sm font-medium text-zinc-950 shadow-xl transition-transform hover:scale-[1.02] hover:bg-white"
            aria-expanded={chatOpen}
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-lime-300 text-zinc-950">
              <MessageCircle className="size-5" />
            </span>
            <span className="hidden sm:inline">Need any help?</span>
          </Button>
        </div>
      </section>
    </AppBackground>
  )
}
