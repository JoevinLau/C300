import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  Calculator,
  CheckCircle2,
  CircleDollarSign,
  Cog,
  FileSpreadsheet,
  Layers,
  Loader2,
  Paintbrush,
  Sparkles,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { AppBackground } from '@/components/AppBackground'
import { calculateEmissions, fetchNaicsOptions, type CalculateResponse, type NaicsOption } from '@/lib/calculator-api'
import { naicsCatalogByCode } from '../../shared/naics-catalog'
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
import { cn } from '@/lib/utils'

const currency = new Intl.NumberFormat('en-SG', {
  style: 'currency',
  currency: 'SGD',
  maximumFractionDigits: 2,
})

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

const kg = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
})

type FormKey =
  | 'invoice_id'
  | 'year'
  | 'total_amount_sgd'
  | 'raw_material_sgd'
  | 'fabrication_sgd'
  | 'surface_treatment_sgd'
  | 'naics_raw_material'
  | 'naics_fabrication'
  | 'naics_surface_treatment'

type CategoryId = 'raw' | 'fabrication' | 'surface'

const CATEGORIES: {
  id: CategoryId
  amountKey: FormKey
  naicsKey: FormKey
  label: string
  sector: string
  icon: LucideIcon
  barClass: string
  rowClass: string
  textClass: string
  defaultNaics: string
}[] = [
  {
    id: 'raw',
    amountKey: 'raw_material_sgd',
    naicsKey: 'naics_raw_material',
    label: 'Raw material',
    sector: 'Machine Shops',
    icon: Layers,
    barClass: 'bg-emerald-400',
    rowClass: 'border-emerald-400/20 bg-emerald-400/[0.04]',
    textClass: 'text-emerald-200',
    defaultNaics: '331110',
  },
  {
    id: 'fabrication',
    amountKey: 'fabrication_sgd',
    naicsKey: 'naics_fabrication',
    label: 'Fabrication',
    sector: 'Machine Shops',
    icon: Cog,
    barClass: 'bg-cyan-400',
    rowClass: 'border-cyan-400/20 bg-cyan-400/[0.04]',
    textClass: 'text-cyan-200',
    defaultNaics: '332710',
  },
  {
    id: 'surface',
    amountKey: 'surface_treatment_sgd',
    naicsKey: 'naics_surface_treatment',
    label: 'Surface treatment',
    sector: 'Metal Coating',
    icon: Paintbrush,
    barClass: 'bg-amber-400',
    rowClass: 'border-amber-400/20 bg-amber-400/[0.04]',
    textClass: 'text-amber-200',
    defaultNaics: '332812',
  },
]

const STEPS = [
  { id: 1, title: 'Invoice', description: 'Spend record' },
  { id: 2, title: 'Allocation', description: 'Amounts & NAICS' },
] as const

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

function parseAmount(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function pctFromAmount(amount: number, total: number): number {
  if (total <= 0) return 0
  return (amount / total) * 100
}

function sortNaicsOptions(options: NaicsOption[], preferredCode: string): NaicsOption[] {
  return [...options].sort((a, b) => {
    if (a.code === preferredCode) return -1
    if (b.code === preferredCode) return 1
    return a.code.localeCompare(b.code)
  })
}

function StepIndicator({ activeStep }: { activeStep: number }) {
  return (
    <ol className="flex flex-wrap gap-2 sm:gap-0 sm:divide-x sm:divide-white/10 sm:rounded-xl sm:border sm:border-white/10 sm:bg-slate-950/40 sm:p-1">
      {STEPS.map((step) => {
        const isActive = step.id === activeStep
        const isDone = step.id < activeStep
        return (
          <li
            key={step.id}
            className={cn(
              'flex min-w-[7.5rem] flex-1 items-center gap-3 rounded-lg px-3 py-2.5 transition-colors sm:rounded-md',
              isActive && 'bg-white/[0.06] ring-1 ring-emerald-300/30',
              isDone && !isActive && 'opacity-80',
            )}
          >
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                isActive && 'bg-emerald-500 text-emerald-950',
                isDone && !isActive && 'bg-emerald-500/20 text-emerald-200',
                !isActive && !isDone && 'border border-white/15 bg-white/5 text-muted-foreground',
              )}
            >
              {isDone && !isActive ? <CheckCircle2 className="size-4" /> : step.id}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{step.title}</span>
              <span className="block truncate text-xs text-muted-foreground">{step.description}</span>
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
    <div className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
      <div className="flex h-4">
        {segments.map((seg) =>
          seg.pct > 0 ? (
            <div
              key={seg.label}
              className={cn('relative transition-all duration-300', seg.className)}
              style={{ width: `${seg.pct}%` }}
              title={`${seg.label}: ${currency.format(seg.amount)} (${seg.pct.toFixed(1)}%)`}
            >
              {seg.pct >= 12 ? (
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-slate-950/80 tabular-nums">
                  {seg.pct.toFixed(0)}%
                </span>
              ) : null}
            </div>
          ) : null,
        )}
      </div>
      <div className="grid divide-x divide-white/10 sm:grid-cols-3">
        {segments.map((seg) => (
          <div key={seg.label} className="px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn('size-2 shrink-0 rounded-full', seg.className)} />
              {seg.label}
            </p>
            <p className="mt-0.5 font-mono text-sm tabular-nums text-foreground">
              {seg.amount > 0 ? currency.format(seg.amount) : '—'}
            </p>
          </div>
        ))}
      </div>
      {barTotal > 0 ? (
        <div className="border-t border-white/10 px-3 py-2 text-right text-xs text-muted-foreground">
          Allocated total{' '}
          <span className="font-mono font-medium text-foreground tabular-nums">
            {currency.format(barTotal)}
          </span>
        </div>
      ) : null}
    </div>
  )
}

function EmissionsBreakdownChart({
  result,
}: {
  result: CalculateResponse
}) {
  const items = CATEGORIES.map((cat) => {
    const emissionKey =
      cat.id === 'raw'
        ? 'raw_material'
        : cat.id === 'fabrication'
          ? 'fabrication'
          : 'surface_treatment'
    const value = result.emissions[emissionKey]
    return { ...cat, value }
  })
  const max = Math.max(...items.map((i) => i.value), 1)

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const width = (item.value / max) * 100
        return (
          <div key={item.id} className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <item.icon className={cn('size-4', item.textClass)} />
                {item.label}
              </span>
              <span className={cn('font-mono tabular-nums', item.textClass)}>
                {kg.format(item.value)} kg
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className={cn('h-full rounded-full transition-all duration-500', item.barClass)}
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ResultsPanel({
  result,
  loading,
  error,
  totalSgd,
  year,
}: {
  result: CalculateResponse | null
  loading: boolean
  error: string | null
  totalSgd: number
  year: string
}) {
  if (loading) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center">
        <Loader2 className="size-10 animate-spin text-emerald-300" />
        <p className="text-sm text-muted-foreground">Running spend-based calculation…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex gap-3 rounded-xl border border-red-400/30 bg-red-950/50 p-4">
        <AlertCircle className="mt-0.5 size-5 shrink-0 text-red-300" />
        <div>
          <p className="font-medium text-red-100">Calculation failed</p>
          <p className="mt-1 text-sm text-red-200/90">{error}</p>
        </div>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-emerald-300/25 bg-emerald-300/[0.03] p-8 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl border border-emerald-300/30 bg-emerald-300/10">
          <Calculator className="size-7 text-emerald-200" />
        </div>
        <div className="max-w-xs space-y-1">
          <p className="font-medium text-foreground">Results will appear here</p>
          <p className="text-sm text-muted-foreground">
            Complete the form and calculate to see 2022 USD costs and emissions by component.
          </p>
        </div>
      </div>
    )
  }

  const totalCostUsd =
    result.costs.raw_material_usd2022 +
    result.costs.fabrication_usd2022 +
    result.costs.surface_treatment_usd2022

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-emerald-300/30 bg-gradient-to-br from-emerald-500/15 via-slate-900/80 to-cyan-500/10 p-5">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-emerald-400/20 blur-2xl"
        />
        <p className="text-xs font-medium uppercase tracking-wider text-emerald-200/80">
          Total emissions
        </p>
        <p className="mt-1 font-mono text-4xl font-semibold tracking-tight text-white tabular-nums">
          {kg.format(result.emissions.total)}
          <span className="ml-2 text-lg font-normal text-emerald-200/90">kg CO₂e</span>
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 font-mono text-emerald-100">
            {result.invoice_id}
          </span>
          {totalSgd > 0 ? (
            <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-muted-foreground">
              {currency.format(totalSgd)} · {year}
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-xs text-muted-foreground">Spend (2022 USD)</p>
          <p className="mt-1 font-mono text-lg text-cyan-200 tabular-nums">{usd.format(totalCostUsd)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-xs text-muted-foreground">Intensity</p>
          <p className="mt-1 font-mono text-lg text-emerald-200 tabular-nums">
            {totalCostUsd > 0
              ? (result.emissions.total / totalCostUsd).toFixed(2)
              : '—'}{' '}
            <span className="text-xs font-sans text-muted-foreground">kg/USD</span>
          </p>
        </div>
      </div>

      <div>
        <p className="mb-3 text-sm font-medium text-muted-foreground">Emissions by component</p>
        <EmissionsBreakdownChart result={result} />
      </div>

      <div className="space-y-2 border-t border-white/10 pt-4">
        <p className="text-sm font-medium text-muted-foreground">2022 USD cost breakdown</p>
        {CATEGORIES.map((cat) => {
          const costKey =
            cat.id === 'raw'
              ? 'raw_material_usd2022'
              : cat.id === 'fabrication'
                ? 'fabrication_usd2022'
                : 'surface_treatment_usd2022'
          const value = result.costs[costKey]
          return (
            <div
              key={cat.id}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm"
            >
              <span className="flex items-center gap-2">
                <cat.icon className={cn('size-4', cat.textClass)} />
                {cat.label}
              </span>
              <span className="font-mono text-cyan-100/90 tabular-nums">{usd.format(value)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CalculationProcessPanel({
  result,
  loading,
}: {
  result: CalculateResponse | null
  loading: boolean
}) {
  if (loading || !result) {
    return null
  }

  const { calculation } = result
  const calc = calculation

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-4">
        <p className="mb-3 font-medium text-amber-100">Step 1: SGD to USD</p>
        <p className="mb-3 text-xs text-muted-foreground">
          FX rate: 1 SGD = {usd.format(calc.fx_rate)} USD
        </p>
        <div className="space-y-3 text-sm">
          <div className="space-y-1.5 rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="flex items-center gap-2 text-muted-foreground">
              <Layers className="text-emerald-400" />
              Raw material
            </p>
            <p className="font-mono tabular-nums text-amber-200">
              {currency.format(calc.sgd_amounts.raw_material)} * {calc.fx_rate.toFixed(4)} = {usd.format(calc.usd_amounts.raw_material)}
            </p>
          </div>
          <div className="space-y-1.5 rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="flex items-center gap-2 text-muted-foreground">
              <Cog className="text-cyan-400" />
              Fabrication
            </p>
            <p className="font-mono tabular-nums text-amber-200">
              {currency.format(calc.sgd_amounts.fabrication)} * {calc.fx_rate.toFixed(4)} = {usd.format(calc.usd_amounts.fabrication)}
            </p>
          </div>
          <div className="space-y-1.5 rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="flex items-center gap-2 text-muted-foreground">
              <Paintbrush className="text-amber-400" />
              Surface treatment
            </p>
            <p className="font-mono tabular-nums text-amber-200">
              {currency.format(calc.sgd_amounts.surface_treatment)} * {calc.fx_rate.toFixed(4)} = {usd.format(calc.usd_amounts.surface_treatment)}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-cyan-400/25 bg-cyan-400/5 p-4">
        <p className="mb-3 font-medium text-cyan-100">Step 2: USD Inflation Adjustment</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Inflation index: {calc.inflation_index.toFixed(2)} ({calc.year} to 2022)
        </p>
        <div className="space-y-3 text-sm">
          <div className="space-y-1.5 rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="flex items-center gap-2 text-muted-foreground">
              <Layers className="text-emerald-400" />
              Raw material
            </p>
            <p className="font-mono tabular-nums text-cyan-200">
              {usd.format(calc.usd_amounts.raw_material)} * (100 / {calc.inflation_index.toFixed(2)}) = {usd.format(calc.usd2022_amounts.raw_material)}
            </p>
          </div>
          <div className="space-y-1.5 rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="flex items-center gap-2 text-muted-foreground">
              <Cog className="text-cyan-400" />
              Fabrication
            </p>
            <p className="font-mono tabular-nums text-cyan-200">
              {usd.format(calc.usd_amounts.fabrication)} * (100 / {calc.inflation_index.toFixed(2)}) = {usd.format(calc.usd2022_amounts.fabrication)}
            </p>
          </div>
          <div className="space-y-1.5 rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="flex items-center gap-2 text-muted-foreground">
              <Paintbrush className="text-amber-400" />
              Surface treatment
            </p>
            <p className="font-mono tabular-nums text-cyan-200">
              {usd.format(calc.usd_amounts.surface_treatment)} * (100 / {calc.inflation_index.toFixed(2)}) = {usd.format(calc.usd2022_amounts.surface_treatment)}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/5 p-4">
        <p className="mb-3 font-medium text-emerald-100">Step 3: Calculate Emissions</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Emission factor (kg CO2e per USD)
        </p>
        <div className="space-y-3 text-sm">
          <div className="space-y-1.5 rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="flex items-center gap-2 text-muted-foreground">
              <Layers className="text-emerald-400" />
              Raw material
            </p>
            <p className="font-mono tabular-nums text-emerald-200">
              {usd.format(calc.usd2022_amounts.raw_material)} * {calc.factors.raw_material.toFixed(4)} = {kg.format(result.emissions.raw_material)} kg
            </p>
          </div>
          <div className="space-y-1.5 rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="flex items-center gap-2 text-muted-foreground">
              <Cog className="text-cyan-400" />
              Fabrication
            </p>
            <p className="font-mono tabular-nums text-emerald-200">
              {usd.format(calc.usd2022_amounts.fabrication)} * {calc.factors.fabrication.toFixed(4)} = {kg.format(result.emissions.fabrication)} kg
            </p>
          </div>
          <div className="space-y-1.5 rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="flex items-center gap-2 text-muted-foreground">
              <Paintbrush className="text-amber-400" />
              Surface treatment
            </p>
            <p className="font-mono tabular-nums text-emerald-200">
              {usd.format(calc.usd2022_amounts.surface_treatment)} * {calc.factors.surface_treatment.toFixed(4)} = {kg.format(result.emissions.surface_treatment)} kg
            </p>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2.5 text-sm font-medium">
            <span className="text-emerald-100">Total Emissions</span>
            <span className="font-mono text-emerald-200 tabular-nums">{kg.format(result.emissions.total)} kg CO2e</span>
          </div>
        </div>
      </div>
    </div>
  )
}
function Method1Page() {
  const [form, setForm] = useState(defaultForm)
  const [activeStep, setActiveStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CalculateResponse | null>(null)
  const [naicsOptions, setNaicsOptions] = useState<NaicsOption[]>([])

  useEffect(() => {
    let cancelled = false
    void fetchNaicsOptions().then((options) => {
      if (!cancelled) setNaicsOptions(options)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const naicsByCode = useMemo(() => naicsCatalogByCode(naicsOptions), [naicsOptions])

  const categoryAmounts = useMemo(
    () =>
      CATEGORIES.map((cat) => ({
        ...cat,
        amount: parseAmount(form[cat.amountKey]),
      })),
    [form],
  )

  const allocationSum = useMemo(
    () => categoryAmounts.reduce((sum, cat) => sum + cat.amount, 0),
    [categoryAmounts],
  )

  const totalSgd = parseAmount(form.total_amount_sgd)
  const hasInvoiceTotal = totalSgd > 0
  const allocationValid = hasInvoiceTotal && Math.abs(allocationSum - totalSgd) < 0.01
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

  function updateField(key: FormKey, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
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
    if (!hasInvoiceTotal) return
    const raw = Number(((totalSgd * rawPct) / 100).toFixed(2))
    const fab = Number(((totalSgd * fabPct) / 100).toFixed(2))
    const surface = Number((totalSgd - raw - fab).toFixed(2))
    setForm((prev) => ({
      ...prev,
      raw_material_sgd: String(raw),
      fabrication_sgd: String(fab),
      surface_treatment_sgd: String(surface),
    }))
    setActiveStep(2)
  }

  function distributeEqually() {
    if (!hasInvoiceTotal) return
    const share = Number((totalSgd / 3).toFixed(2))
    const raw = share
    const fab = share
    const surface = Number((totalSgd - raw - fab).toFixed(2))
    setForm((prev) => ({
      ...prev,
      raw_material_sgd: String(raw),
      fabrication_sgd: String(fab),
      surface_treatment_sgd: String(surface),
    }))
    setActiveStep(2)
  }

  function applyDefaultSplit() {
    applyAmountPreset(50, 35, 15)
  }

  function loadDemo() {
    setForm(demoForm)
    setActiveStep(1)
    setError(null)
    setResult(null)
  }

  function resetForm() {
    setForm(defaultForm)
    setActiveStep(1)
    setError(null)
    setResult(null)
  }

  async function handleCalculate(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setResult(null)

    if (!hasInvoiceTotal) {
      setError('Enter a valid invoice total in SGD.')
      setActiveStep(1)
      return
    }

    if (allocationSum <= 0) {
      setError('Enter an amount for at least one cost category.')
      setActiveStep(2)
      return
    }

    if (!allocationValid) {
      setError(
        `Line items must sum to the invoice total (${currency.format(totalSgd)}). Currently ${currency.format(allocationSum)}.`,
      )
      setActiveStep(2)
      return
    }

    if (!form.invoice_id.trim()) {
      setError('Invoice ID is required.')
      setActiveStep(1)
      return
    }

    const year = Number(form.year)
    if (!Number.isInteger(year) || year < 2020 || year > 2030) {
      setError('Year must be between 2020 and 2030.')
      setActiveStep(1)
      return
    }

    setLoading(true)
    try {
      const response = await calculateEmissions({
        invoice_id: form.invoice_id.trim(),
        year,
        total_amount_sgd: totalSgd,
        allocation: {
          raw_material_pct: allocationPercentages.raw,
          fabrication_pct: allocationPercentages.fabrication,
          surface_treatment_pct: allocationPercentages.surface,
        },
        naics: {
          raw_material: form.naics_raw_material.trim(),
          fabrication: form.naics_fabrication.trim(),
          surface_treatment: form.naics_surface_treatment.trim(),
        },
      })
      setResult(response)
      setActiveStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Calculation failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppBackground>
      <section className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-8 pb-16">
        <header className="space-y-6">
          <Button
            variant="ghost"
            className="-ml-2 text-muted-foreground hover:text-foreground"
            onClick={() => {
              window.location.hash = ''
            }}
          >
            <ArrowLeft />
            Back to workflows
          </Button>

          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl space-y-4">
              <div className="flex size-12 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-300/10 text-emerald-200">
                <FileSpreadsheet className="size-6" />
              </div>
              <h1 className="bg-gradient-to-br from-white via-slate-100 to-emerald-200 bg-clip-text text-4xl font-semibold tracking-tight text-transparent sm:text-5xl">
                Method 1
              </h1>
              <p className="text-lg leading-relaxed text-muted-foreground">
                Spend-based calculator for invoice-level carbon estimates. Allocate spend across
                manufacturing stages and apply sector emission factors.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={loadDemo}>
                <Sparkles />
                Load demo
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
                Reset
              </Button>
            </div>
          </div>

          <StepIndicator activeStep={result ? 2 : activeStep} />
        </header>

        <form onSubmit={handleCalculate} className="grid items-start gap-6 lg:grid-cols-[1fr_22rem] xl:grid-cols-[1fr_24rem]">
          <div className="space-y-5">
            <Card className="border-white/10 bg-slate-950/55 shadow-lg shadow-black/20 backdrop-blur-xl">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-sm font-semibold text-emerald-200">
                    1
                  </span>
                  <div>
                    <CardTitle>Invoice details</CardTitle>
                    <CardDescription>Spend record and reporting year for FX adjustment.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
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
                    min={2020}
                    max={2030}
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

            <Card className="border-white/10 bg-slate-950/55 shadow-lg shadow-black/20 backdrop-blur-xl">
              <CardHeader className="pb-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-sm font-semibold text-emerald-200">
                      2
                    </span>
                    <div>
                      <CardTitle>Cost allocation</CardTitle>
                      <CardDescription>
                        Enter SGD amounts per component and assign a NAICS code for each line.
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={applyDefaultSplit}
                      disabled={!hasInvoiceTotal}
                    >
                      50 / 35 / 15
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
              <CardContent className="space-y-5">
                {!hasInvoiceTotal ? (
                  <div className="flex gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-muted-foreground">
                    <CircleDollarSign className="mt-0.5 size-4 shrink-0" />
                    Enter the invoice total above before allocating amounts.
                  </div>
                ) : null}

                <AllocationBar segments={allocationSegments} />

                <div
                  className={cn(
                    'flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm',
                    allocationValid
                      ? 'border border-emerald-400/25 bg-emerald-400/10 text-emerald-100'
                      : 'border border-amber-400/25 bg-amber-400/10 text-amber-100',
                  )}
                >
                  <span className="flex items-center gap-2">
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
                  <span className="font-mono font-semibold tabular-nums">
                    {currency.format(allocationSum)}
                    {hasInvoiceTotal ? ` / ${currency.format(totalSgd)}` : ''}
                  </span>
                </div>

                <div className="overflow-hidden rounded-xl border border-white/10">
                  <div className="hidden bg-white/[0.04] px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid sm:grid-cols-[1.2fr_9rem_4rem_minmax(13rem,1.2fr)] sm:gap-3">
                    <span>Component</span>
                    <span>Amount (SGD)</span>
                    <span className="text-right">Share</span>
                    <span>NAICS sector</span>
                  </div>

                  <div className="divide-y divide-white/10">
                    {categoryAmounts.map((cat) => {
                      const pct = allocationPercentages[cat.id]
                      const selectedNaics = naicsByCode.get(form[cat.naicsKey])
                      const categoryNaicsOptions = sortNaicsOptions(naicsOptions, cat.defaultNaics)

                      return (
                        <div
                          key={cat.id}
                          className={cn(
                            'grid gap-3 px-4 py-4 sm:grid-cols-[1.2fr_9rem_4rem_minmax(13rem,1.2fr)] sm:items-start sm:gap-3',
                            cat.rowClass,
                          )}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span
                              className={cn(
                                'flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/20',
                                cat.textClass,
                              )}
                            >
                              <cat.icon className="size-4" />
                            </span>
                            <div className="min-w-0">
                              <p className="font-medium">{cat.label}</p>
                              <p className="truncate text-xs text-muted-foreground">{cat.sector}</p>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <Label htmlFor={cat.amountKey} className="text-xs sm:sr-only">
                              {cat.label} amount
                            </Label>
                            <Input
                              id={cat.amountKey}
                              type="number"
                              min={0}
                              step="0.01"
                              placeholder="0.00"
                              disabled={!hasInvoiceTotal}
                              value={form[cat.amountKey]}
                              onChange={(e) => updateField(cat.amountKey, e.target.value)}
                              className="font-mono tabular-nums"
                            />
                          </div>

                          <p
                            className={cn(
                              'text-right font-mono text-sm tabular-nums sm:pt-0',
                              cat.textClass,
                            )}
                          >
                            {cat.amount > 0 ? `${pct.toFixed(1)}%` : '—'}
                          </p>

                          <div className="space-y-1.5 sm:col-start-4">
                            <Label htmlFor={cat.naicsKey} className="text-xs sm:sr-only">
                              {cat.label} NAICS
                            </Label>
                            <Select
                              value={form[cat.naicsKey]}
                              onValueChange={(value) => updateField(cat.naicsKey, value)}
                            >
                              <SelectTrigger id={cat.naicsKey} className="w-full font-mono">
                                <SelectValue placeholder="Select NAICS sector">
                                  {selectedNaics?.code}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent position="popper" className="max-w-[min(24rem,calc(100vw-2rem))]">
                                {categoryNaicsOptions.map((option) => (
                                  <SelectItem
                                    key={option.code}
                                    value={option.code}
                                    textValue={`${option.code} ${option.description}`}
                                    className="items-start py-2.5"
                                  >
                                    <div className="flex flex-col gap-0.5 pr-2">
                                      <span className="font-mono font-medium">{option.code}</span>
                                      <span className="text-xs leading-snug text-muted-foreground">
                                        {option.description}
                                      </span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs leading-snug text-muted-foreground">
                              {selectedNaics?.description ?? 'Select a NAICS sector for this line.'}
                            </p>
                            {selectedNaics?.kgco2e_per_usd != null ? (
                              <p className="font-mono text-[11px] text-emerald-200/80 tabular-nums">
                                {selectedNaics.kgco2e_per_usd.toFixed(2)} kg CO₂e / USD
                              </p>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Button
              type="submit"
              size="lg"
              className="h-12 w-full bg-emerald-600 text-base text-white shadow-lg shadow-emerald-950/50 hover:bg-emerald-500"
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
          </div>

          <aside className="lg:sticky lg:top-8">
            <Card className="border-white/10 bg-slate-950/60 shadow-xl shadow-black/30 backdrop-blur-xl">
              <CardHeader>
                <CardTitle>Results</CardTitle>
                <CardDescription>Live output from your calculation.</CardDescription>
              </CardHeader>
              <CardContent>
                <ResultsPanel
                  totalSgd={totalSgd}
                  year={form.year}
                  result={result}
                  loading={loading}
                  error={error}
                />
              </CardContent>
            </Card>
            <Card className="mt-4 border-white/10 bg-slate-950/60 shadow-xl shadow-black/30 backdrop-blur-xl">
              <CardHeader>
                <CardTitle>Calculation Process</CardTitle>
                <CardDescription>Step-by-step breakdown of the calculation.</CardDescription>
              </CardHeader>
              <CardContent>
                <CalculationProcessPanel
                  loading={loading}
                  result={result}
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
