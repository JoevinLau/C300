import { useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  Calculator,
  CheckCircle2,
  CircleDollarSign,
  FileSpreadsheet,
  Loader2,
  Plus,
  Sparkles,
  X,
} from 'lucide-react'
import { AppBackground } from '@/components/AppBackground'
import {
  buildRouteLegEmissions,
  METHOD1_CATEGORIES as CATEGORIES,
  METHOD1_STEPS as STEPS,
  PORT_OF_DISCHARGE,
  TRANSPORT_PORTS,
  SearchableNaicsSelect,
  currency,
  parseAmount,
  type CategoryId,
  type LineItem,
  type Method1FormKey as FormKey,
} from '@/components/Method1SharedInputs'
import { CalculationProcessPanel, ResultsPanel } from '@/components/useeio/Method1ResultsPanels'
import { calculateEcoTransitTransport, calculateEmissions, fetchNaicsOptions, type CalculateResponse } from '@/lib/calculator-api'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toCalculationHistoryTransport } from '@/lib/calculation-history'
import {
  isSupportedCalculationYear,
  MAX_CALCULATION_YEAR,
  MIN_CALCULATION_YEAR,
} from '@/lib/calculation-workflow'
import { useCalculationHistorySave } from '@/hooks/useCalculationHistorySave'
import { cn } from '@/lib/utils'
import { useCalculationWorkspace } from '@/features/calculation-workspace/useCalculationWorkspace'


const defaultForm: Record<FormKey, string> = {
  invoice_id: '',
  year: '2024',
  total_amount_sgd: '',
  raw_material_sgd: '',
  fabrication_sgd: '',
  surface_treatment_sgd: '',
  naics_raw_material: '331110',
  naics_fabrication: '332710',
  naics_surface_treatment: '332812',
}

const demoForm: Record<FormKey, string> = {
  ...defaultForm,
  invoice_id: 'INV-2024-001',
  total_amount_sgd: '2614',
  raw_material_sgd: '1307',
  fabrication_sgd: '914.9',
  surface_treatment_sgd: '392.1',
}

const TRANSPORT_COUNTRIES = TRANSPORT_PORTS
  .map((item) => item.country)
  .sort((a, b) => a.localeCompare(b))

const initialLineItems: Record<CategoryId, LineItem[]> = {
  raw: [{ amount: '', naics: '331110' }],
  fabrication: [{ amount: '', naics: '332710' }],
  surface: [{ amount: '', naics: '332812' }],
}

const initialTransport = {
  weight: '',
  origin: 'China',
  portOfLoading: 'Port of Shanghai',
  portOfDischarge: PORT_OF_DISCHARGE,
  mode: 'sea' as const,
  allowEstimate: false,
}

function StepIndicator({ activeStep }: { activeStep: number }) {
  return (
    <ol className="grid gap-2">
      {STEPS.map((step) => {
        const isActive = step.id === activeStep
        const isDone = step.id < activeStep
        return (
          <li
            key={step.id}
            className={cn(
              'flex items-center gap-3 rounded-md border px-3 py-2.5 transition-colors',
              isActive && 'border-lime-300 bg-lime-300 text-zinc-950',
              isDone && !isActive && 'border-white/10 bg-white/10 text-white',
              !isActive && !isDone && 'border-white/10 text-zinc-300',
            )}
          >
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-md text-sm font-semibold',
                isActive && 'bg-zinc-950 text-lime-300',
                isDone && !isActive && 'bg-lime-300 text-zinc-950',
                !isActive && !isDone && 'bg-white/10 text-zinc-300',
              )}
            >
              {isDone && !isActive ? <CheckCircle2 className="size-4" /> : step.id}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{step.title}</span>
              <span className={cn('block truncate text-xs', isActive ? 'text-zinc-700' : 'text-zinc-400')}>
                {step.description}
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function AllocationBar({
  segments,
}: {
  segments: { pct: number; amount: number; className: string; label: string }[]
}) {
  const barTotal = segments.reduce((sum, seg) => sum + seg.amount, 0)

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-900/12 bg-white shadow-[0_10px_30px_rgba(24,39,24,0.05)]">
      <div className="flex flex-wrap items-end justify-between gap-3 px-4 pb-3 pt-4">
        <div>
          <p className="text-sm font-semibold text-zinc-950">Allocation overview</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Live distribution across invoice components</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Allocated</p>
          <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-zinc-950">
            {barTotal > 0 ? currency.format(barTotal) : currency.format(0)}
          </p>
        </div>
      </div>

      <div className="mx-4 flex h-2 overflow-hidden rounded-full bg-zinc-950/8">
        {segments.map((seg) =>
          seg.pct > 0 ? (
            <div
              key={seg.label}
              className={cn('transition-[width] duration-300', seg.className)}
              style={{ width: `${seg.pct}%` }}
              title={`${seg.label}: ${currency.format(seg.amount)} (${seg.pct.toFixed(1)}%)`}
            />
          ) : null,
        )}
      </div>

      <div className="mt-4 grid gap-px bg-zinc-900/10 sm:grid-cols-3">
        {segments.map((seg) => (
          <div key={seg.label} className="bg-white px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-xs font-medium text-zinc-600">
                <span className={cn('h-3 w-1 shrink-0 rounded-full', seg.className)} />
                {seg.label}
              </p>
              <span className="font-mono text-xs font-semibold tabular-nums text-zinc-500">
                {seg.pct > 0 ? `${seg.pct.toFixed(1)}%` : '0.0%'}
              </span>
            </div>
            <p className="mt-1.5 font-mono text-sm font-semibold tabular-nums text-foreground">
              {seg.amount > 0 ? currency.format(seg.amount) : currency.format(0)}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function Method1Page({ onHistorySaved }: { onHistorySaved?: () => void }) {
  const [activeStep, setActiveStep] = useState(1)
  const {
    historyWarning,
    clearHistoryWarning,
    saveCalculationHistory,
  } = useCalculationHistorySave(onHistorySaved)

  const workspace = useCalculationWorkspace<FormKey, CategoryId, (typeof CATEGORIES)[number], CalculateResponse>({
    initialForm: defaultForm,
    categories: CATEGORIES,
    initialLineItems,
    totalAmountKey: 'total_amount_sgd',
    initialTransport,
    transportPorts: TRANSPORT_PORTS,
    loadNaicsOptions: fetchNaicsOptions,
    calculateTransport: calculateEcoTransitTransport,
    clearHistoryWarning,
  })
  const { form, naicsOptions, naicsError, naicsByCode } = workspace
  const rawItems = workspace.lineItems.raw
  const fabItems = workspace.lineItems.fabrication
  const surfaceItems = workspace.lineItems.surface
  const {
    categoryAmounts,
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
    loading,
    error,
  } = workspace.calculation
  const {
    weight: transportWeight,
    origin: transportOrigin,
    portOfLoading: transportPortOfLoading,
    portOfDischarge: transportPortOfDischarge,
    mode: transportMode,
    allowEstimate: allowTransportEstimate,
    loading: transportLoading,
    error: transportError,
    result: transportResult,
    selectedPort: selectedTransportPort,
  } = workspace.transport

  const loadingPortOptions = selectedTransportPort?.loadingPorts ?? []
  const routeProcess = [
    transportPortOfLoading.trim() || 'Port of loading',
    ...(selectedTransportPort?.intermediatePorts ?? []),
    transportPortOfDischarge.trim() || PORT_OF_DISCHARGE,
  ]
  const routeLegs = buildRouteLegEmissions(routeProcess, transportMode, transportResult)

  const updateItem = workspace.updateItem
  const addItem = workspace.addItem
  const removeItem = workspace.removeItem

  async function handleTransportCalculate(event?: React.SyntheticEvent) {
    if (event) event.preventDefault()
    await workspace.transport.run()
  }

  function updateField(key: FormKey, value: string) {
    workspace.updateField(key, value)
    if (key === 'invoice_id' || key === 'year' || key === 'total_amount_sgd') setActiveStep(1)
    if (
      key === 'raw_material_sgd' ||
      key === 'fabrication_sgd' ||
      key === 'surface_treatment_sgd' ||
      key.startsWith('naics_')
    ) {
      setActiveStep(2)
    }
  }

  function applyAmountPreset(rawPct: number, fabPct: number, surfacePct: number) {
    const applied = workspace.applyPreset({ raw: rawPct, fabrication: fabPct, surface: surfacePct })
    if (applied) setActiveStep(2)
  }

  function distributeEqually() {
    const applied = workspace.distributeEqually()
    if (applied) setActiveStep(2)
  }

  function applyDefaultSplit() {
    applyAmountPreset(50, 35, 15)
  }

  function loadDemo() {
    const demoTransportWeight = '500'
    const demoTransportOrigin = 'China'
    const demoTransportMode: 'sea' | 'land' | 'air' = 'sea'

    workspace.replaceWorkspace({
      form: demoForm,
      lineItems: {
        raw: [{ amount: demoForm.raw_material_sgd, naics: demoForm.naics_raw_material }],
        fabrication: [{ amount: demoForm.fabrication_sgd, naics: demoForm.naics_fabrication }],
        surface: [{ amount: demoForm.surface_treatment_sgd, naics: demoForm.naics_surface_treatment }],
      },
      transport: {
        weight: demoTransportWeight,
        origin: demoTransportOrigin,
        portOfLoading: 'Port of Shanghai',
        portOfDischarge: PORT_OF_DISCHARGE,
        mode: demoTransportMode,
        allowEstimate: false,
        result: {
          transport: {
            origin: demoTransportOrigin,
            port_of_loading: 'Port of Shanghai',
            port_of_discharge: PORT_OF_DISCHARGE,
            distance_km: null,
            weight_kg: Number(demoTransportWeight),
            chosen_mode: demoTransportMode,
            chosen_emissions_kg: null,
            energy_mj: null,
            source: 'EcoTransit World',
            estimated: false,
            raw: {},
          },
        },
      },
      result: null,
    })
    setActiveStep(1)
  }

  function resetForm() {
    workspace.resetWorkspace()
    setActiveStep(1)
  }

  async function handleCalculate(event: React.FormEvent) {
    event.preventDefault()
    workspace.calculation.prepare()

    if (!hasInvoiceTotal) {
      workspace.calculation.fail('Enter a valid invoice total in SGD.')
      setActiveStep(1)
      return
    }

    if (allocationSum <= 0) {
      workspace.calculation.fail('Enter an amount for at least one cost category.')
      setActiveStep(2)
      return
    }

    if (!allocationValid) {
      workspace.calculation.fail(
        `Line items must sum to the invoice total (${currency.format(totalSgd)}). Currently ${currency.format(allocationSum)}.`,
      )
      setActiveStep(2)
      return
    }

    if (!form.invoice_id.trim()) {
      workspace.calculation.fail('Invoice ID is required.')
      setActiveStep(1)
      return
    }

    const year = Number(form.year)
    if (!isSupportedCalculationYear(year)) {
      workspace.calculation.fail(`Year must be between ${MIN_CALCULATION_YEAR} and ${MAX_CALCULATION_YEAR}.`)
      setActiveStep(1)
      return
    }

    const lineItems = [
      ...rawItems.map((item) => ({ category: 'raw_material' as const, amount_sgd: parseAmount(item.amount), naics_code: item.naics.trim() })),
      ...fabItems.map((item) => ({ category: 'fabrication' as const, amount_sgd: parseAmount(item.amount), naics_code: item.naics.trim() })),
      ...surfaceItems.map((item) => ({ category: 'surface_treatment' as const, amount_sgd: parseAmount(item.amount), naics_code: item.naics.trim() })),
    ].filter((item) => item.amount_sgd > 0)
    const rawSum = rawItems.reduce((sum, item) => sum + parseAmount(item.amount), 0) || parseAmount(form.raw_material_sgd)
    const fabSum = fabItems.reduce((sum, item) => sum + parseAmount(item.amount), 0) || parseAmount(form.fabrication_sgd)
    const surfSum = surfaceItems.reduce((sum, item) => sum + parseAmount(item.amount), 0) || parseAmount(form.surface_treatment_sgd)

    const calculationRequest = {
      invoice_id: form.invoice_id.trim(),
      year,
      total_amount_sgd: totalSgd,
      sgd_amounts: {
        raw_material: rawSum,
        fabrication: fabSum,
        surface_treatment: surfSum,
      },
      allocation: {
        raw_material_pct: allocationPercentages.raw,
        fabrication_pct: allocationPercentages.fabrication,
        surface_treatment_pct: allocationPercentages.surface,
      },
      naics: {
        raw_material: (rawItems[0]?.naics ?? form.naics_raw_material).trim(),
        fabrication: (fabItems[0]?.naics ?? form.naics_fabrication).trim(),
        surface_treatment: (surfaceItems[0]?.naics ?? form.naics_surface_treatment).trim(),
      },
      line_items: lineItems,
    }
    await workspace.calculation.run(
      () => calculateEmissions(calculationRequest),
      async (response) => {
        setActiveStep(2)
        await saveCalculationHistory({
          method: 'useeio',
          request: calculationRequest,
          result: response,
          transport: toCalculationHistoryTransport(transportResult),
        })
      },
    )
  }

  return (
    <AppBackground>
      <section className="relative z-10 mx-auto grid w-full max-w-[92rem] gap-4 pb-8 lg:grid-cols-[12rem_minmax(0,1fr)] 2xl:grid-cols-[12rem_minmax(0,1fr)_20rem]">
        <aside className="min-w-0 rounded-lg bg-zinc-950 p-4 text-white lg:sticky lg:top-4 lg:self-start">
          <Button
            variant="ghost"
            className="-ml-2 mb-8 text-zinc-300 hover:bg-white/10 hover:text-white"
            onClick={() => {
              window.location.hash = ''
            }}
          >
            <ArrowLeft />
            Back to workflows
          </Button>

          <div className="space-y-5">
            <div className="flex size-12 items-center justify-center rounded-md bg-lime-300 text-zinc-950">
                <FileSpreadsheet className="size-6" />
              </div>
              <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-lime-300">USEEIO</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight">
                USEEIO
              </h1>
              </div>
              <p className="text-sm leading-6 text-zinc-300">
                Spend-based calculator for invoice-level carbon estimates. Allocate spend across
                manufacturing stages and apply sector emission factors.
              </p>
            </div>

          <div className="mt-8 border-t border-white/10 pt-5">
            <StepIndicator activeStep={result ? 2 : activeStep} />
          </div>

          <div className="mt-8 grid gap-2">
              <Button type="button" variant="outline" size="sm" onClick={loadDemo}>
                <Sparkles />
                Load demo
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
                Reset
              </Button>
          </div>
        </aside>

        <form onSubmit={handleCalculate} className="contents">
          <div className="min-w-0 space-y-4">
            <div className="rounded-lg border border-zinc-900/12 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Calculation workspace</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">Invoice allocation</h2>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-md bg-zinc-950 px-4 py-3 text-white">
                    <p className="text-xs text-zinc-400">Invoice total</p>
                    <p className="mt-1 font-mono text-lg">{hasInvoiceTotal ? currency.format(totalSgd) : '-'}</p>
                  </div>
                  <div className="rounded-md bg-lime-200 px-4 py-3 text-lime-950">
                    <p className="text-xs text-lime-950/70">Allocated</p>
                    <p className="mt-1 font-mono text-lg">{allocationSum > 0 ? currency.format(allocationSum) : '-'}</p>
                  </div>
                </div>
              </div>
            </div>

            {naicsError ? (
              <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                NAICS reference data unavailable: {naicsError}
              </div>
            ) : null}

            <Card className="gap-0 overflow-hidden border-zinc-900/12 bg-white py-0 shadow-sm">
              <CardHeader className="border-b border-zinc-900/10 bg-zinc-950 px-5 py-4 text-white">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-md bg-lime-300 text-sm font-semibold text-zinc-950">
                    1
                  </span>
                  <div>
                    <CardTitle>Invoice details</CardTitle>
                    <CardDescription className="text-zinc-300">Spend record and reporting year for FX adjustment.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 py-6 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="invoice_id">Invoice ID</Label>
                  <Input
                    id="invoice_id"
                    placeholder="INV-2024-001"
                    value={form.invoice_id}
                    onChange={(e) => updateField('invoice_id', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="year">Year</Label>
                  <Input
                    id="year"
                    type="number"
                    min={MIN_CALCULATION_YEAR}
                    max={MAX_CALCULATION_YEAR}
                    value={form.year}
                    onChange={(e) => updateField('year', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="total_amount_sgd" className="flex items-center gap-1.5">
                    <CircleDollarSign className="size-3.5 text-muted-foreground" />
                    Total amount (SGD)
                  </Label>
                  <Input
                    id="total_amount_sgd"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="2,614.00"
                    value={form.total_amount_sgd}
                    onChange={(e) => updateField('total_amount_sgd', e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="gap-0 overflow-hidden rounded-xl border-zinc-900/12 bg-white py-0 shadow-[0_18px_50px_rgba(24,39,24,0.08)]">
              <CardHeader className="border-b border-zinc-900/10 bg-white px-6 py-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-lg bg-zinc-950 text-sm font-semibold text-lime-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                      2
                    </span>
                    <div className="min-w-0">
                      <CardTitle className="text-lg">Cost allocation</CardTitle>
                      <CardDescription className="mt-1 max-w-2xl text-sm leading-5">
                        Enter SGD amounts per component and assign a NAICS code for each line.
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex w-fit shrink-0 flex-wrap gap-1 rounded-lg border border-zinc-900/10 bg-zinc-950/[0.025] p-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={applyDefaultSplit}
                      disabled={!hasInvoiceTotal}
                      className="bg-white shadow-sm hover:bg-lime-50"
                    >
                      Apply 50 / 35 / 15
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={distributeEqually}
                      disabled={!hasInvoiceTotal}
                    >
                      Split equally
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 bg-zinc-950/[0.015] px-6 py-6">
                {!hasInvoiceTotal ? (
                  <div className="flex gap-3 rounded-lg border border-zinc-900/12 bg-white px-4 py-3 text-sm text-muted-foreground">
                    <CircleDollarSign className="mt-0.5 size-4 shrink-0" />
                    Enter the invoice total above before allocating amounts.
                  </div>
                ) : null}

                <AllocationBar segments={allocationSegments} />

                <div
                  className={cn(
                    'flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm shadow-[0_6px_18px_rgba(24,39,24,0.04)]',
                    allocationValid
                      ? 'border-lime-500/30 bg-lime-50 text-lime-900'
                      : 'border-rose-400/30 bg-rose-50 text-rose-900',
                  )}
                >
                  <span className="flex items-center gap-2 font-medium">
                    {allocationValid ? (
                      <CheckCircle2 className="size-4 shrink-0" />
                    ) : (
                      <AlertCircle className="size-4 shrink-0" />
                    )}
                    {allocationValid
                      ? 'Line items match invoice total'
                      : hasInvoiceTotal
                        ? remaining > 0
                          ? `${currency.format(remaining)} remaining to allocate`
                          : `${currency.format(Math.abs(remaining))} over invoice total`
                        : 'Waiting for invoice total'}
                  </span>
                  <span className="font-mono text-sm font-semibold tabular-nums">
                    {currency.format(allocationSum)}
                    {hasInvoiceTotal ? ` / ${currency.format(totalSgd)}` : ''}
                  </span>
                </div>

                <div className="overflow-hidden rounded-xl border border-zinc-900/12 bg-white shadow-[0_10px_30px_rgba(24,39,24,0.05)]">
                  <div className="w-full">
                    <div className="hidden bg-zinc-950 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-300 md:grid md:grid-cols-[12rem_minmax(9rem,11rem)_4rem_minmax(12rem,1fr)] md:gap-4">
                      <span>Component</span>
                      <span>Amount (SGD)</span>
                      <span className="text-right">Share</span>
                      <span>NAICS sector</span>
                    </div>

                    <div className="divide-y divide-zinc-900/10">
                    {categoryAmounts.map((cat) => {
                      const pct = allocationPercentages[cat.id]
                      const items = cat.id === 'raw' ? rawItems : cat.id === 'fabrication' ? fabItems : surfaceItems

                      return (
                        <div
                          key={cat.id}
                          className={cn(
                            'relative grid gap-4 bg-white py-5 pl-5 pr-4 transition-colors md:grid-cols-[12rem_minmax(9rem,11rem)_4rem_minmax(12rem,1fr)] md:items-start md:gap-4',
                            cat.id === 'raw' && 'hover:bg-lime-50/35',
                            cat.id === 'fabrication' && 'hover:bg-teal-50/35',
                            cat.id === 'surface' && 'hover:bg-rose-50/35',
                          )}
                        >
                          <span className={cn('absolute inset-y-0 left-0 w-1', cat.barClass)} />
                          <div className="flex min-w-0 items-center gap-3">
                            <span
                              className={cn(
                                'flex size-10 shrink-0 items-center justify-center rounded-lg border border-zinc-900/10 bg-zinc-950/[0.035] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]',
                                cat.textClass,
                              )}
                            >
                              <cat.icon className="size-4" />
                            </span>
                            <div className="min-w-0">
                              <p className="whitespace-nowrap text-sm font-semibold">{cat.label}</p>
                              <p className="truncate text-xs text-muted-foreground">{cat.sector}</p>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <Label className="text-xs md:sr-only">{cat.label} amounts</Label>
                            <div className="space-y-2">
                              {items.map((item, index) => (
                                <div key={index} className="flex min-w-0 items-center gap-1.5">
                                  <Input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    placeholder="0.00"
                                    disabled={!hasInvoiceTotal}
                                    value={item.amount}
                                    onChange={(event) => updateItem(cat.id as CategoryId, index, { amount: event.target.value })}
                                    className="h-10 min-w-0 flex-1 bg-zinc-950/[0.025] text-right font-mono tabular-nums focus-visible:bg-white"
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="size-9 text-zinc-400 hover:bg-rose-50 hover:text-rose-700"
                                    onClick={() => removeItem(cat.id as CategoryId, index)}
                                    disabled={items.length <= 1}
                                    aria-label={`Remove ${cat.label} entry ${index + 1}`}
                                  >
                                    <X />
                                  </Button>
                                </div>
                              ))}
                              <Button type="button" variant="outline" size="sm" className="h-8 w-fit border-zinc-900/15 bg-white text-xs" onClick={() => addItem(cat.id as CategoryId)} disabled={!hasInvoiceTotal}>
                                <Plus />
                                Add entry
                              </Button>
                            </div>
                          </div>

                          <div className="flex items-center justify-between md:block">
                            <span className="text-xs font-medium text-muted-foreground md:hidden">Share</span>
                            <p
                              className={cn(
                                'font-mono text-sm font-semibold tabular-nums md:pt-2 md:text-right',
                                cat.textClass,
                              )}
                            >
                              {cat.amount > 0 ? `${pct.toFixed(1)}%` : '0.0%'}
                            </p>
                          </div>

                          <div className="min-w-0 space-y-1.5 md:col-start-4">
                            <Label className="text-xs md:sr-only">{cat.label} NAICS codes</Label>
                            <div className="space-y-2">
                              {items.map((item, index) => (
                                <SearchableNaicsSelect
                                  key={index}
                                  value={item.naics}
                                  options={naicsOptions}
                                  preferredCode={cat.defaultNaics}
                                  naicsByCode={naicsByCode}
                                  onChange={(value) => updateItem(cat.id as CategoryId, index, { naics: value })}
                                />
                              ))}
                            </div>
                            <p className="text-xs leading-5 text-muted-foreground">
                              Type a code or keyword to filter NAICS options.
                            </p>
                          </div>
                        </div>
                      )
                    })}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="gap-0 overflow-hidden border-zinc-900/12 bg-white py-0 shadow-sm">
              <CardHeader className="border-b border-zinc-900/10 bg-zinc-950 px-5 py-4 text-white">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-md bg-lime-300 text-sm font-semibold text-zinc-950">
                    T
                  </span>
                  <div className="min-w-0">
                    <CardTitle>Transportation</CardTitle>
                    <CardDescription className="text-zinc-300">Estimate transport emissions (sea / land / air) from origin country.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 py-6 sm:grid-cols-3">
                <div className="space-y-2 sm:col-span-1">
                  <Label htmlFor="transport_weight">Shipment weight (kg)</Label>
                  <Input
                    id="transport_weight"
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    placeholder="0"
                    value={transportWeight}
                    onChange={(event) => {
                      workspace.transport.setWeight(event.target.value)
                    }}
                  />
                </div>
                <div className="space-y-2 sm:col-span-1">
                  <Label htmlFor="transport_origin">Origin country</Label>
                  <Select
                    value={transportOrigin}
                    onValueChange={(value) => {
                      workspace.transport.setOrigin(value)
                    }}
                  >
                    <SelectTrigger id="transport_origin" className="w-full font-mono">
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      {TRANSPORT_COUNTRIES.map((country) => (
                        <SelectItem key={country} value={country} className="font-mono">
                          {country}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="grid gap-2 rounded-lg border border-zinc-900/12 bg-zinc-950/5 p-3 text-xs">
                    <div>
                      <Label htmlFor="transport_port_loading" className="text-xs text-muted-foreground">Port of loading</Label>
                      {loadingPortOptions.length > 0 ? (
                        <Select
                          value={transportPortOfLoading}
                          onValueChange={(value) => {
                            workspace.transport.setPortOfLoading(value)
                          }}
                        >
                          <SelectTrigger id="transport_port_loading" className="mt-1 h-9 bg-white text-xs">
                            <SelectValue placeholder="Choose port of loading" />
                          </SelectTrigger>
                          <SelectContent>
                            {loadingPortOptions.map((port) => (
                              <SelectItem key={port} value={port}>{port}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          id="transport_port_loading"
                          value={transportPortOfLoading}
                          onChange={(event) => {
                            workspace.transport.setPortOfLoading(event.target.value)
                          }}
                          className="mt-1 h-9 bg-white text-xs"
                          placeholder="Enter port of loading"
                        />
                      )}
                    </div>
                    <div>
                      <Label htmlFor="transport_port_discharge" className="text-xs text-muted-foreground">Port of discharge</Label>
                      <Input
                        id="transport_port_discharge"
                        value={transportPortOfDischarge}
                        onChange={(event) => {
                          workspace.transport.setPortOfDischarge(event.target.value)
                        }}
                        className="mt-1 h-9 bg-white text-xs"
                      />
                    </div>
                    <div className="rounded-md border border-zinc-900/10 bg-white px-3 py-2">
                      <div className="font-medium text-zinc-700">Process</div>
                      <div className="mt-2 grid gap-1.5">
                        {routeLegs.map((leg) => (
                          <div key={`${leg.from}-${leg.to}`} className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground">
                            <span>{leg.from} -&gt; {leg.to}</span>
                            <span className="font-mono text-zinc-700">
                              {leg.emissionsKg != null ? `${leg.emissionsKg.toFixed(2)} kg CO2e` : 'Calculate to show emission'}
                            </span>
                            {leg.distanceKm != null ? (
                              <span className="basis-full font-mono text-[11px] text-muted-foreground">{leg.distanceKm.toFixed(0)} km</span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="space-y-2 sm:col-span-1">
                  <Label htmlFor="transport_mode">Mode</Label>
                  <Select
                    value={transportMode}
                    onValueChange={(value) => {
                      workspace.transport.setMode(value as 'sea' | 'land' | 'air')
                    }}
                  >
                    <SelectTrigger id="transport_mode" className="w-full">
                      <SelectValue placeholder="Select mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sea">Sea</SelectItem>
                      <SelectItem value="land">Land</SelectItem>
                      <SelectItem value="air">Air</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="sm:col-span-3">
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={handleTransportCalculate} disabled={transportLoading}>
                      {transportLoading ? 'Calculating…' : 'Calculate transport'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={workspace.transport.reset}
                    >
                      Reset
                    </Button>
                  </div>

                  <label className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-lime-600"
                      checked={allowTransportEstimate}
                      onChange={(event) => {
                        workspace.transport.setAllowEstimate(event.target.checked)
                      }}
                    />
                    <span>Allow a clearly marked local estimate if EcoTransit is unavailable.</span>
                  </label>

                  {transportError ? (
                    <div className="mt-3 text-rose-600">{transportError}</div>
                  ) : null}

                  {transportResult ? (
                    <div className="mt-3">
                      <div className="font-medium">Transport results</div>
                      <div className="mt-2">
                        <div>Origin: {transportResult.transport.origin}</div>
                        <div>Port of loading: {transportResult.transport.port_of_loading}</div>
                        <div>Port of discharge: {transportResult.transport.port_of_discharge}</div>
                        <div>Distance: {transportResult.transport.distance_km != null ? `${transportResult.transport.distance_km} km` : 'Returned by EcoTransit when available'}</div>
                        <div>Weight: {transportResult.transport.weight_kg} kg</div>
                        <div className="mt-2">
                          EcoTransit ({transportResult.transport.chosen_mode}):{' '}
                          {transportResult.transport.chosen_emissions_kg != null
                            ? `${Number(transportResult.transport.chosen_emissions_kg).toFixed(2)} kg CO2e`
                            : 'No emissions value found in EcoTransit response'}
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">Source: {transportResult.transport.source}</div>
                        {transportResult.transport.estimated ? (
                          <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                            Estimated result — verify it before using it for reporting.
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            
            <Button
              type="submit"
              size="lg"
              className="h-12 w-full bg-lime-600 text-base text-white shadow-lg shadow-lime-900/20 hover:bg-lime-500"
              disabled={loading || !allocationValid}
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" />
                  Calculating emissions…
                </>
              ) : (
                <>
                  <Calculator />
                  Calculate emissions
                </>
              )}
            </Button>

            {historyWarning ? (
              <div
                className="flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2.5 text-sm text-amber-900"
                role="status"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{historyWarning}</span>
              </div>
            ) : null}

          </div>


          <aside className="min-w-0 space-y-4 lg:col-start-2 2xl:sticky 2xl:top-4 2xl:col-start-3 2xl:self-start">
            <Card className="gap-0 overflow-hidden border-zinc-900/12 bg-white py-0 shadow-sm">
              <CardHeader className="border-b border-zinc-900/10 bg-zinc-950 px-5 py-4 text-white">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-md bg-lime-300 text-sm font-semibold text-zinc-950">
                    <Calculator className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <CardTitle className="whitespace-nowrap">Results</CardTitle>
                    <CardDescription className="whitespace-nowrap text-zinc-300">Live output from your calculation.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="py-6">
                <ResultsPanel
                  totalSgd={totalSgd}
                  year={form.year}
                  result={result}
                  loading={loading}
                  error={error}
                  transport={transportResult}
                  naicsByCode={naicsByCode}
                />
              </CardContent>
            </Card>

            <Card className="gap-0 overflow-hidden border-zinc-900/12 bg-white py-0 shadow-sm">
              <CardHeader className="border-b border-zinc-900/10 bg-[#faf8f1] px-5 py-4">
                <CardTitle className="whitespace-nowrap">Calculation Process</CardTitle>
                <CardDescription className="text-sm leading-5">Step-by-step breakdown of the calculation.</CardDescription>
              </CardHeader>
              <CardContent className="px-5 py-6">
                <CalculationProcessPanel
                  loading={loading}
                  result={result}
                  naicsByCode={naicsByCode}
                />
              </CardContent>
            </Card>
          </aside>


        </form>
      </section>
    </AppBackground>
  )
}

export default Method1Page
