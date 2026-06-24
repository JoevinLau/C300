import { useEffect, useMemo, useState } from 'react'
import type React from 'react'
import {
  ArrowLeft,
  Bot,
  Calculator,
  Factory,
  Layers,
  Loader2,
  MessageCircle,
  Paintbrush,
  Plus,
  Route,
  Send,
  Sparkles,
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
  type EcoTransitResponse,
  type Method2CalculateResponse,
  type Method2MachineReference,
  type NaicsOption,
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
  pctFromAmount,
  type CategoryId,
  type LineItem,
  type Method1FormKey,
} from '@/components/Method1SharedInputs'
import { cn } from '@/lib/utils'
import { naicsCatalogByCode } from '../../shared/naics-catalog'

type Message = { role: 'user' | 'assistant'; content: string }

type MachiningRow = {
  id: string
  machineType: string
  dutyLevel: string
  operatingHours: string
}

type ComponentView = {
  id: string
  label: string
  description: string
  icon: LucideIcon
  source: string
  formula: string
  valueKg: number
  confidence: 'Primary' | 'Estimated' | 'Fallback'
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

const fallbackMachines: Method2MachineReference[] = [
  { machineType: 'CNC Milling', dutyLevel: 'Light', avgKW: 7.15, hourlyEmission: 2.98 },
  { machineType: 'CNC Milling', dutyLevel: 'Medium', avgKW: 14.3, hourlyEmission: 5.96 },
  { machineType: 'CNC Milling', dutyLevel: 'Heavy', avgKW: 29.25, hourlyEmission: 12.19 },
]

const METHOD2_SPEND_CATEGORIES: CategoryId[] = ['raw', 'surface']

const requiredDocuments = [
  'Supplier PCF, EPD, or raw material carbon factor',
  'Transport origin, distance, mode, and material weight',
  'Annual electricity use, machine hours, or machining cost pool',
  'Surface treatment supplier disclosure or process factor',
]

function buildComponents(result: Method2CalculateResponse | null, transportSummary: string): ComponentView[] {
  const emissions = result?.emissions
  const machiningEntry = result?.machining.entries[0]

  return [
    {
      id: 'metal',
      label: 'Raw material',
      description: 'Upstream metal or block production before machining.',
      icon: Layers,
      source: 'Method 1 spend pipeline',
      formula: 'Cost -> FX -> GDP deflator -> NAICS factor -> emissions',
      valueKg: emissions?.raw_material ?? 0,
      confidence: 'Fallback',
      rowClass: 'border-lime-400/20 bg-lime-400/[0.04]',
      barClass: 'bg-lime-400',
      textClass: 'text-lime-700',
      details: [
        { label: 'NAICS proxy', value: demoPart.rawMaterialNaics },
        { label: 'Cost basis', value: currency.format(demoPart.rawMaterialCostSgd) },
        { label: 'Reuse', value: 'Method 1 compute_emissions' },
      ],
    },
    {
      id: 'transport',
      label: 'Transportation',
      description: 'EcoTransit transport emissions copied from Method 1 behavior.',
      icon: Route,
      source: 'EcoTransit World',
      formula: 'Existing Method 1 /ecotransit implementation',
      valueKg: emissions?.transportation ?? 0,
      confidence: 'Estimated',
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
      source: 'Temporary machine library',
      formula: 'Hourly emission factor x operating hours',
      valueKg: emissions?.machining ?? 0,
      confidence: 'Primary',
      rowClass: 'border-teal-400/20 bg-teal-400/[0.04]',
      barClass: 'bg-teal-400',
      textClass: 'text-teal-700',
      details: [
        { label: 'Machine', value: machiningEntry ? `${machiningEntry.machineType} / ${machiningEntry.dutyLevel}` : 'Not calculated' },
        { label: 'Hourly factor', value: machiningEntry ? `${machiningEntry.hourlyEmission} kg CO2e/hr` : 'Select machine' },
        { label: 'Future source', value: 'Machine database replaces static library' },
      ],
    },
    {
      id: 'surface',
      label: 'Surface treatment',
      description: 'Anodizing, plating, heat treatment, polishing, or coating.',
      icon: Paintbrush,
      source: 'Method 1 spend pipeline',
      formula: 'Cost -> FX -> GDP deflator -> NAICS factor -> emissions',
      valueKg: emissions?.surface_treatment ?? 0,
      confidence: 'Fallback',
      rowClass: 'border-rose-400/20 bg-rose-400/[0.04]',
      barClass: 'bg-rose-400',
      textClass: 'text-rose-700',
      details: [
        { label: 'NAICS proxy', value: demoPart.surfaceTreatmentNaics },
        { label: 'Cost basis', value: currency.format(demoPart.surfaceTreatmentCostSgd) },
        { label: 'Reuse', value: 'Method 1 compute_emissions' },
      ],
    },
  ]
}

function ResultsPanel({
  components,
  result,
}: {
  components: ComponentView[]
  result: Method2CalculateResponse | null
}) {
  const total = result?.emissions.total ?? 0
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
            {demoPart.partId}
          </span>
          <span className="rounded-full border border-zinc-900/12 bg-zinc-950/5 px-2.5 py-1 text-muted-foreground">
            {demoPart.weightKg} kg material - {demoPart.year}
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

export default function Method2Page() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [chatOpen, setChatOpen] = useState(false)
  const [chatLoading, setChatLoading] = useState(false)
  const [form, setForm] = useState<Record<Method1FormKey, string>>(defaultSpendForm)
  const [naicsOptions, setNaicsOptions] = useState<NaicsOption[]>([])
  const [rawItems, setRawItems] = useState<LineItem[]>([
    { amount: defaultSpendForm.raw_material_sgd, naics: defaultSpendForm.naics_raw_material },
  ])
  const [fabItems, setFabItems] = useState<LineItem[]>([
    { amount: defaultSpendForm.fabrication_sgd, naics: defaultSpendForm.naics_fabrication },
  ])
  const [surfaceItems, setSurfaceItems] = useState<LineItem[]>([
    { amount: defaultSpendForm.surface_treatment_sgd, naics: defaultSpendForm.naics_surface_treatment },
  ])
  const [machineLibrary, setMachineLibrary] = useState<Method2MachineReference[]>(fallbackMachines)
  const [rows, setRows] = useState<MachiningRow[]>([
    { id: 'machine-1', machineType: 'CNC Milling', dutyLevel: 'Medium', operatingHours: '5' },
  ])
  const [transportWeight, setTransportWeight] = useState(String(demoPart.weightKg))
  const [transportOrigin, setTransportOrigin] = useState('Malaysia')
  const [transportPortOfLoading, setTransportPortOfLoading] = useState('Port Klang')
  const [transportPortOfDischarge, setTransportPortOfDischarge] = useState(PORT_OF_DISCHARGE)
  const [transportMode, setTransportMode] = useState<'sea' | 'land' | 'air'>('sea')
  const [transportResult, setTransportResult] = useState<EcoTransitResponse | null>(null)
  const [transportSummary, setTransportSummary] = useState('No transport calculation yet')
  const [transportLoading, setTransportLoading] = useState(false)
  const [transportError, setTransportError] = useState<string | null>(null)
  const [calculateLoading, setCalculateLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Method2CalculateResponse | null>(null)

  useEffect(() => {
    void fetchMethod2Machines()
      .then(setMachineLibrary)
      .catch(() => {
        setMachineLibrary(fallbackMachines)
      })
  }, [])

  useEffect(() => {
    let cancelled = false
    void fetchNaicsOptions().then((options) => {
      if (!cancelled) setNaicsOptions(options)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const selectedTransportPort = useMemo(
    () => TRANSPORT_PORTS.find((item) => item.country.toLowerCase() === transportOrigin.trim().toLowerCase()),
    [transportOrigin],
  )

  useEffect(() => {
    if (selectedTransportPort) {
      setTransportPortOfLoading(selectedTransportPort.loadingPort)
    }
  }, [selectedTransportPort])

  const naicsByCode = useMemo(() => naicsCatalogByCode(naicsOptions), [naicsOptions])

  const categoryAmounts = useMemo(
    () =>
      METHOD1_CATEGORIES.filter((cat) => METHOD2_SPEND_CATEGORIES.includes(cat.id)).map((cat) => {
        let amount = 0
        if (cat.id === 'raw') amount = rawItems.reduce((sum, item) => sum + parseAmount(item.amount), 0)
        if (cat.id === 'surface') amount = surfaceItems.reduce((sum, item) => sum + parseAmount(item.amount), 0)
        if (amount === 0) amount = parseAmount(form[cat.amountKey])
        return { ...cat, amount }
      }),
    [form, rawItems, fabItems, surfaceItems],
  )

  const allocationSum = useMemo(
    () => categoryAmounts.reduce((sum, cat) => sum + cat.amount, 0),
    [categoryAmounts],
  )
  const totalSgd = parseAmount(form.total_amount_sgd)
  const hasInvoiceTotal = true
  const allocationValid = allocationSum > 0
  const remaining = hasInvoiceTotal ? totalSgd - allocationSum : 0

  const allocationSegments = useMemo(() => {
    const pctBase = allocationSum > 0 ? allocationSum : totalSgd
    return categoryAmounts.map((cat) => ({
      label: cat.label,
      amount: cat.amount,
      pct: pctFromAmount(cat.amount, pctBase),
      className: cat.barClass,
    }))
  }, [allocationSum, categoryAmounts, totalSgd])

  const allocationPercentages = useMemo(() => {
    const pctBase = allocationSum > 0 ? allocationSum : totalSgd
    return Object.fromEntries(
      categoryAmounts.map((cat) => [cat.id, pctFromAmount(cat.amount, pctBase)]),
    ) as Record<CategoryId, number>
  }, [allocationSum, categoryAmounts, totalSgd])

  const machineTypes = useMemo(
    () => Array.from(new Set(machineLibrary.map((machine) => machine.machineType))),
    [machineLibrary],
  )

  const components = useMemo(() => buildComponents(result, transportSummary), [result, transportSummary])

  const fixedContext = useMemo(() => {
    const lines = components.map(
      (item) =>
        `${item.label}: ${item.valueKg} kg CO2e (${item.confidence}; ${item.source}; ${item.formula})`,
    )
    return [
      `Method 2 part: ${demoPart.partName} (${demoPart.partId})`,
      `Supplier: ${demoPart.supplier}`,
      `Material: ${demoPart.material}, weight ${demoPart.weightKg} kg`,
      `Total emissions: ${(result?.emissions.total ?? 0).toFixed(2)} kg CO2e`,
      ...lines,
      `Missing source documents: ${requiredDocuments.join('; ')}`,
    ].join('\n')
  }, [components, result])

  function updateField(key: Method1FormKey, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function updateItem(category: CategoryId, index: number, fields: Partial<LineItem>) {
    if (category === 'raw') setRawItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...fields } : item)))
    if (category === 'fabrication') setFabItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...fields } : item)))
    if (category === 'surface') setSurfaceItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...fields } : item)))
  }

  function addItem(category: CategoryId) {
    if (category === 'raw') setRawItems((prev) => [...prev, { amount: '', naics: '331110' }])
    if (category === 'fabrication') setFabItems((prev) => [...prev, { amount: '', naics: '332710' }])
    if (category === 'surface') setSurfaceItems((prev) => [...prev, { amount: '', naics: '332812' }])
  }

  function removeItem(category: CategoryId, index: number) {
    if (category === 'raw') setRawItems((prev) => prev.filter((_, i) => i !== index))
    if (category === 'fabrication') setFabItems((prev) => prev.filter((_, i) => i !== index))
    if (category === 'surface') setSurfaceItems((prev) => prev.filter((_, i) => i !== index))
  }

  function applyAmountPreset(rawPct: number, fabPct: number, surfacePct: number) {
    if (!hasInvoiceTotal) return
    const raw = Number(((totalSgd * rawPct) / 100).toFixed(2))
    const fab = Number(((totalSgd * fabPct) / 100).toFixed(2))
    const surface = Number((totalSgd - raw - fab).toFixed(2))
    setRawItems([{ amount: String(raw), naics: rawItems[0]?.naics ?? form.naics_raw_material }])
    setFabItems([{ amount: String(fab), naics: fabItems[0]?.naics ?? form.naics_fabrication }])
    setSurfaceItems([{ amount: String(surface), naics: surfaceItems[0]?.naics ?? form.naics_surface_treatment }])
    setForm((prev) => ({
      ...prev,
      raw_material_sgd: String(raw),
      fabrication_sgd: String(fab),
      surface_treatment_sgd: String(surface),
    }))
  }

  function applyDefaultSplit() {
    applyAmountPreset(50, 35, 15)
  }

  function distributeEqually() {
    if (!hasInvoiceTotal) return
    const share = Number((totalSgd / 3).toFixed(2))
    const raw = share
    const fab = share
    const surface = Number((totalSgd - raw - fab).toFixed(2))
    setRawItems([{ amount: String(raw), naics: rawItems[0]?.naics ?? form.naics_raw_material }])
    setFabItems([{ amount: String(fab), naics: fabItems[0]?.naics ?? form.naics_fabrication }])
    setSurfaceItems([{ amount: String(surface), naics: surfaceItems[0]?.naics ?? form.naics_surface_treatment }])
    setForm((prev) => ({
      ...prev,
      raw_material_sgd: String(raw),
      fabrication_sgd: String(fab),
      surface_treatment_sgd: String(surface),
    }))
  }

  async function handleTransportCalculate(event?: React.SyntheticEvent) {
    if (event) event.preventDefault()
    setTransportError(null)
    setTransportResult(null)
    const weight = Number(transportWeight)
    if (!Number.isFinite(weight) || weight <= 0) {
      setTransportError('Enter a valid shipment weight in kg')
      return
    }

    if (!transportOrigin || transportOrigin.trim().length === 0) {
      setTransportError('Enter origin country')
      return
    }

    if (!transportPortOfLoading.trim()) {
      setTransportError('Enter port of loading')
      return
    }

    if (!transportPortOfDischarge.trim()) {
      setTransportError('Enter port of discharge')
      return
    }

    setTransportLoading(true)
    try {
      const matchedPort = TRANSPORT_PORTS.find(
        (item) => item.country.toLowerCase() === transportOrigin.trim().toLowerCase(),
      )
      const origin = matchedPort?.country ?? transportOrigin.trim()
      const response = await calculateEcoTransitTransport({
        origin_country: origin,
        port_of_loading: transportPortOfLoading.trim(),
        port_of_discharge: transportPortOfDischarge.trim(),
        weight_kg: weight,
        transport_mode: transportMode,
      })
      const emissions = response.transport.chosen_emissions_kg ?? 0
      setTransportResult(response)
      setTransportSummary(`${kg.format(emissions)} kg CO2e via ${response.transport.chosen_mode}`)
    } catch (err) {
      setTransportError(err instanceof Error ? err.message : String(err))
    } finally {
      setTransportLoading(false)
    }
  }

  async function handleCalculate() {
    if (!allocationValid) {
      setError('Enter at least one raw material or surface treatment amount before calculating Method 2.')
      return
    }

    const rawSum = rawItems.reduce((sum, item) => sum + parseAmount(item.amount), 0) || parseAmount(form.raw_material_sgd)
    const surfSum = surfaceItems.reduce((sum, item) => sum + parseAmount(item.amount), 0) || parseAmount(form.surface_treatment_sgd)
    const year = Number(form.year)
    const transportEmissions = transportResult?.transport?.chosen_emissions_kg ?? 0

    setCalculateLoading(true)
    setError(null)
    try {
      const response = await calculateMethod2({
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
        transport_source: 'EcoTransit World',
        machining_entries: rows.map((row) => ({
          machine_type: row.machineType,
          duty_level: row.dutyLevel,
          operating_hours: Number(row.operatingHours),
        })),
      })
      setResult(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCalculateLoading(false)
    }
  }

  async function sendMessage(e?: React.FormEvent, promptOverride?: string) {
    if (e) e.preventDefault()
    const message = (promptOverride ?? input).trim()
    if (!message) return

    setMessages((m) => [...m, { role: 'user', content: message }])
    if (!promptOverride) setInput('')
    setChatLoading(true)

    try {
      const formData = new FormData()
      formData.append('message', `${fixedContext}\n\nUser question: ${message}`)
      const res = await fetch('http://127.0.0.1:8000/method2-chat', { method: 'POST', body: formData })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.detail ? String(data.detail) : res.statusText)
      setMessages((m) => [...m, { role: 'assistant', content: typeof data.reply === 'string' ? data.reply : 'No reply returned.' }])
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', content: `Error: ${err instanceof Error ? err.message : String(err)}` }])
    } finally {
      setChatLoading(false)
    }
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
                  selectedTransportPort={selectedTransportPort}
                  setTransportWeight={setTransportWeight}
                  setTransportOrigin={setTransportOrigin}
                  setTransportPortOfLoading={setTransportPortOfLoading}
                  setTransportPortOfDischarge={setTransportPortOfDischarge}
                  setTransportMode={setTransportMode}
                  setTransportResult={setTransportResult}
                  setTransportError={setTransportError}
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
                          <CardDescription>Temporary fixed machine data, ready for database replacement.</CardDescription>
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setRows((current) => [...current, { id: `machine-${Date.now()}`, machineType: 'CNC Milling', dutyLevel: 'Light', operatingHours: '1' }])}
                      >
                        <Plus />
                        Add
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 px-5 py-6">
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
                              onValueChange={(value) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, machineType: value, dutyLevel: machineLibrary.find((machine) => machine.machineType === value)?.dutyLevel ?? '' } : item))}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {machineTypes.map((machineType) => <SelectItem key={machineType} value={machineType}>{machineType}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Duty Level</Label>
                            <Select value={row.dutyLevel} onValueChange={(value) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, dutyLevel: value } : item))}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {dutyLevels.map((dutyLevel) => <SelectItem key={dutyLevel} value={dutyLevel}>{dutyLevel}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Operating Hours</Label>
                            <Input value={row.operatingHours} onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, operatingHours: event.target.value } : item))} />
                            <p className="mt-1 text-xs text-muted-foreground">
                              {ref ? `${ref.hourlyEmission} kg CO2e/hr, ${ref.avgKW} kW avg` : 'Select reference'}
                            </p>
                          </div>
                          <div className="flex items-end">
                            <Button type="button" size="icon" variant="outline" onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))} disabled={rows.length === 1}>
                              <Trash2 />
                            </Button>
                          </div>
                        </div>
                      )
                    })}

                    <div className="rounded-lg border border-amber-400/25 bg-amber-50 p-4">
                      <div className="flex items-start gap-3">
                        <Sparkles className="mt-0.5 size-5 shrink-0 text-amber-700" />
                        <p className="text-sm leading-6 text-amber-900/80">
                          Database replacement point: backend `StaticMachineDataSource` in `calculation/method2_calculations.py`.
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
                    <ResultsPanel components={components} result={result} />
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
                  <Button type="button" variant="ghost" size="icon" className="text-zinc-300 hover:bg-white/10 hover:text-white" onClick={() => setChatOpen(false)}>
                    <X />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex h-[min(32rem,calc(100vh-13rem))] flex-col p-0">
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
                  {messages.length === 0 ? (
                    <div className="mx-auto mt-8 max-w-sm rounded-lg border border-dashed border-lime-300/35 bg-lime-300/[0.03] p-5 text-center text-sm leading-6 text-muted-foreground">
                      Ask the assistant to explain the current Method 2 calculation.
                    </div>
                  ) : (
                    messages.map((m, i) => (
                      <div key={i} className={`max-w-[88%] rounded-lg px-3 py-2 ${m.role === 'user' ? 'ml-auto bg-lime-100 text-zinc-950' : 'mr-auto bg-zinc-950 text-white'}`}>
                        <div className="whitespace-pre-wrap text-sm leading-6">{m.content}</div>
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

          <button
            type="button"
            onClick={() => setChatOpen((value) => !value)}
            className="flex items-center gap-3 rounded-full border border-lime-300/70 bg-white px-4 py-3 text-sm font-medium text-zinc-950 shadow-xl transition-transform hover:scale-[1.02]"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-lime-300 text-zinc-950">
              <MessageCircle className="size-5" />
            </span>
            <span className="hidden sm:inline">Need any help?</span>
          </button>
        </div>
      </section>
    </AppBackground>
  )
}
