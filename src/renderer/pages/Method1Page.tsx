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
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { AppBackground } from '@/components/AppBackground'
import { calculateEcoTransitTransport, calculateEmissions, fetchNaicsOptions, type CalculateResponse, type NaicsOption } from '@/lib/calculator-api'
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
    barClass: 'bg-lime-400',
    rowClass: 'border-lime-400/20 bg-lime-400/[0.04]',
    textClass: 'text-lime-700',
    defaultNaics: '331110',
  },
  {
    id: 'fabrication',
    amountKey: 'fabrication_sgd',
    naicsKey: 'naics_fabrication',
    label: 'Fabrication',
    sector: 'Machine Shops',
    icon: Cog,
    barClass: 'bg-teal-400',
    rowClass: 'border-teal-400/20 bg-teal-400/[0.04]',
    textClass: 'text-teal-700',
    defaultNaics: '332710',
  },
  {
    id: 'surface',
    amountKey: 'surface_treatment_sgd',
    naicsKey: 'naics_surface_treatment',
    label: 'Surface treatment',
    sector: 'Metal Coating',
    icon: Paintbrush,
    barClass: 'bg-rose-400',
    rowClass: 'border-rose-400/20 bg-rose-400/[0.04]',
    textClass: 'text-rose-700',
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

const PORT_OF_DISCHARGE = 'Singapore'

type TransportPort = {
  country: string
  loadingPort: string
}

const TRANSPORT_PORTS: TransportPort[] = [
  { country: 'Singapore', loadingPort: 'Port of Tuas / Singapore' },
  { country: 'China', loadingPort: 'Port of Shanghai' },
  { country: 'South Korea', loadingPort: 'Port of Busan' },
  { country: 'Japan', loadingPort: 'Port of Nagoya / Tokyo / Yokohama' },
  { country: 'India', loadingPort: 'JNPT (Nhava Sheva) / Mundra' },
  { country: 'United States', loadingPort: 'Port of Los Angeles / Long Beach' },
  { country: 'Germany', loadingPort: 'Port of Hamburg' },
  { country: 'Netherlands', loadingPort: 'Port of Rotterdam' },
  { country: 'Australia', loadingPort: 'Port of Melbourne / Hedland' },
  { country: 'Brazil', loadingPort: 'Port of Santos' },
  { country: 'Canada', loadingPort: 'Port of Vancouver' },
  { country: 'Malaysia (Peninsular)', loadingPort: 'Port Klang' },
  { country: 'Vietnam', loadingPort: 'Port of Hai Phong' },
  { country: 'Indonesia (Java-Bali)', loadingPort: 'Port of Tanjung Priok (Jakarta)' },
  { country: 'Thailand', loadingPort: 'Port of Laem Chabang' },
  { country: 'Philippines', loadingPort: 'Port of Manila' },
  { country: 'Cambodia', loadingPort: 'Port of Sihanoukville' },
  { country: 'Laos', loadingPort: 'Via Port of Laem Chabang (Thailand)' },
  { country: 'Brunei', loadingPort: 'Muara Port' },
  { country: 'Myanmar', loadingPort: 'Port of Yangon' },
  { country: 'Hong Kong', loadingPort: 'Port of Hong Kong' },
  { country: 'Taiwan', loadingPort: 'Port of Kaohsiung' },
  { country: 'Mongolia', loadingPort: 'Via Port of Tianjin (China)' },
  { country: 'Bangladesh', loadingPort: 'Port of Chittagong' },
  { country: 'Pakistan', loadingPort: 'Port of Karachi' },
  { country: 'Sri Lanka', loadingPort: 'Port of Colombo' },
  { country: 'Nepal', loadingPort: 'Via Port of Kolkata (India)' },
  { country: 'Bhutan', loadingPort: 'Via Port of Kolkata (India)' },
  { country: 'Saudi Arabia', loadingPort: 'Jeddah Islamic Port' },
  { country: 'UAE', loadingPort: 'Jebel Ali Port' },
  { country: 'Qatar', loadingPort: 'Hamad Port' },
  { country: 'Oman', loadingPort: 'Port of Sohar' },
  { country: 'Israel', loadingPort: 'Port of Haifa' },
  { country: 'Belgium', loadingPort: 'Port of Antwerp-Bruges' },
  { country: 'United Kingdom', loadingPort: 'Port of Felixstowe' },
  { country: 'France', loadingPort: 'Port of Le Havre' },
  { country: 'Italy', loadingPort: 'Port of Genoa' },
  { country: 'Spain', loadingPort: 'Port of Valencia' },
  { country: 'Mexico', loadingPort: 'Port of Manzanillo' },
  { country: 'Argentina', loadingPort: 'Port of Buenos Aires' },
  { country: 'Chile', loadingPort: 'Port of San Antonio' },
  { country: 'Colombia', loadingPort: 'Port of Cartagena' },
  { country: 'Peru', loadingPort: 'Port of Callao' },
  { country: 'South Africa', loadingPort: 'Port of Durban' },
  { country: 'Egypt', loadingPort: 'Port of Alexandria' },
  { country: 'Morocco', loadingPort: 'Port of Tanger Med' },
  { country: 'Kenya', loadingPort: 'Port of Mombasa' },
  { country: 'Nigeria', loadingPort: 'Port of Lagos (Apapa)' },
  { country: 'New Zealand', loadingPort: 'Port of Auckland' },
  { country: 'Norway', loadingPort: 'Port of Oslo' },
  { country: 'Sweden', loadingPort: 'Port of Gothenburg' },
]

const TRANSPORT_COUNTRIES = TRANSPORT_PORTS.map((item) => item.country)

type HistoryItem = {
  invoiceId: string
  year: number
  totalKgCo2e: number
  calc: CalculateResponse['calculation']
  naics: {
    raw?: string
    fabrication?: string
    surface?: string
  }
}

function parseAmount(value: string): number {
  const normalized = String(value).trim().replace(/,/g, '')
  const parsed = Number(normalized)
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
    <div className="overflow-hidden rounded-lg border border-zinc-900/12 bg-zinc-950/5">
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
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-zinc-950/80 tabular-nums">
                  {seg.pct.toFixed(0)}%
                </span>
              ) : null}
            </div>
          ) : null,
        )}
      </div>
      <div className="grid divide-x divide-zinc-900/12 sm:grid-cols-3">
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
        <div className="border-t border-zinc-900/12 px-3 py-2 text-right text-xs text-muted-foreground">
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
            <div className="h-2 overflow-hidden rounded-full bg-zinc-900/10">
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
  transport,
}: {
  result: CalculateResponse | null
  loading: boolean
  error: string | null
  totalSgd: number
  year: string
  transport?: any | null
}) {
  if (loading) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-zinc-900/15 bg-white/70 p-8 text-center">
        <Loader2 className="size-10 animate-spin text-lime-700" />
        <p className="text-sm text-muted-foreground">Running spend-based calculation…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex gap-3 rounded-lg border border-red-400/30 bg-red-50 p-4">
        <AlertCircle className="mt-0.5 size-5 shrink-0 text-red-600" />
        <div>
          <p className="font-medium text-red-900">Calculation failed</p>
          <p className="mt-1 text-sm text-red-700">{error}</p>
        </div>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-lime-300/25 bg-lime-300/[0.03] p-8 text-center">
        <div className="flex size-14 items-center justify-center rounded-lg border border-lime-300/30 bg-lime-300/10">
          <Calculator className="size-7 text-lime-700" />
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
  const transportEmissions = transport?.transport?.chosen_emissions_kg ?? 0
  const combinedEmissions = result.emissions.total + transportEmissions

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-lg border border-lime-300/30 bg-gradient-to-br from-lime-500/15 via-white/80 to-teal-500/10 p-5">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-lime-400/20 blur-2xl"
        />
        <p className="text-xs font-medium uppercase tracking-wider text-lime-700/80">
          Total emissions
        </p>
        <p className="mt-1 font-mono text-4xl font-semibold tracking-tight text-zinc-950 tabular-nums">
          {kg.format(result.emissions.total)}
          <span className="ml-2 text-lg font-normal text-lime-700/90">kg CO₂e</span>
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-zinc-900/12 bg-zinc-950/5 px-2.5 py-1 font-mono text-lime-800">
            {result.invoice_id}
          </span>
          {totalSgd > 0 ? (
            <span className="rounded-full border border-zinc-900/12 bg-zinc-950/5 px-2.5 py-1 text-muted-foreground">
              {currency.format(totalSgd)} · {year}
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-zinc-900/12 bg-white/70 p-3">
          <p className="text-xs text-muted-foreground">Spend (2022 USD)</p>
          <p className="mt-1 font-mono text-lg text-teal-700 tabular-nums">{usd.format(totalCostUsd)}</p>
        </div>
        <div className="rounded-lg border border-zinc-900/12 bg-white/70 p-3">
          <p className="text-xs text-muted-foreground">Intensity</p>
          <p className="mt-1 font-mono text-lg text-lime-700 tabular-nums">
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

      <div className="space-y-2 border-t border-zinc-900/12 pt-4">
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
              className="flex items-center justify-between rounded-lg border border-zinc-900/12 bg-white/70 px-3 py-2.5 text-sm"
            >
              <span className="flex items-center gap-2">
                <cat.icon className={cn('size-4', cat.textClass)} />
                {cat.label}
              </span>
              <span className="font-mono text-teal-800/90 tabular-nums">{usd.format(value)}</span>
            </div>
          )
        })}
      </div>

      {transportEmissions > 0 ? (
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">Transport emissions</div>
            <div className="font-mono text-sm text-foreground">{kg.format(transportEmissions)} kg CO₂e</div>
          </div>
          <div className="flex items-center justify-between border-t pt-2">
            <div className="text-sm font-medium">Total including transport</div>
            <div className="font-mono text-sm font-semibold text-foreground">{kg.format(combinedEmissions)} kg CO₂e</div>
          </div>
        </div>
      ) : null}
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
      <div className="rounded-lg border border-rose-400/25 bg-rose-400/5 p-4">
        <p className="mb-3 font-medium text-rose-800">Step 1: SGD to USD</p>
        <p className="mb-3 text-xs text-muted-foreground">
          FX rate: 1 SGD = {usd.format(calc.fx_rate)} USD
        </p>
        <div className="space-y-3 text-sm">
          <div className="space-y-1.5 rounded-lg border border-zinc-900/12 bg-zinc-950/5 p-3">
            <p className="flex items-center gap-2 text-muted-foreground">
              <Layers className="text-lime-400" />
              Raw material
            </p>
            <p className="font-mono tabular-nums text-rose-700">
              {currency.format(calc.sgd_amounts.raw_material)} * {calc.fx_rate.toFixed(4)} = {usd.format(calc.usd_amounts.raw_material)}
            </p>
          </div>
          <div className="space-y-1.5 rounded-lg border border-zinc-900/12 bg-zinc-950/5 p-3">
            <p className="flex items-center gap-2 text-muted-foreground">
              <Cog className="text-teal-400" />
              Fabrication
            </p>
            <p className="font-mono tabular-nums text-rose-700">
              {currency.format(calc.sgd_amounts.fabrication)} * {calc.fx_rate.toFixed(4)} = {usd.format(calc.usd_amounts.fabrication)}
            </p>
          </div>
          <div className="space-y-1.5 rounded-lg border border-zinc-900/12 bg-zinc-950/5 p-3">
            <p className="flex items-center gap-2 text-muted-foreground">
              <Paintbrush className="text-rose-400" />
              Surface treatment
            </p>
            <p className="font-mono tabular-nums text-rose-700">
              {currency.format(calc.sgd_amounts.surface_treatment)} * {calc.fx_rate.toFixed(4)} = {usd.format(calc.usd_amounts.surface_treatment)}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-teal-400/25 bg-teal-400/5 p-4">
        <p className="mb-3 font-medium text-teal-800">Step 2: USD Inflation Adjustment</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Inflation index: {calc.inflation_index.toFixed(2)} ({calc.year} to 2022)
        </p>
        <div className="space-y-3 text-sm">
          <div className="space-y-1.5 rounded-lg border border-zinc-900/12 bg-zinc-950/5 p-3">
            <p className="flex items-center gap-2 text-muted-foreground">
              <Layers className="text-lime-400" />
              Raw material
            </p>
            <p className="font-mono tabular-nums text-teal-700">
              {usd.format(calc.usd_amounts.raw_material)} * (100 / {calc.inflation_index.toFixed(2)}) = {usd.format(calc.usd2022_amounts.raw_material)}
            </p>
          </div>
          <div className="space-y-1.5 rounded-lg border border-zinc-900/12 bg-zinc-950/5 p-3">
            <p className="flex items-center gap-2 text-muted-foreground">
              <Cog className="text-teal-400" />
              Fabrication
            </p>
            <p className="font-mono tabular-nums text-teal-700">
              {usd.format(calc.usd_amounts.fabrication)} * (100 / {calc.inflation_index.toFixed(2)}) = {usd.format(calc.usd2022_amounts.fabrication)}
            </p>
          </div>
          <div className="space-y-1.5 rounded-lg border border-zinc-900/12 bg-zinc-950/5 p-3">
            <p className="flex items-center gap-2 text-muted-foreground">
              <Paintbrush className="text-rose-400" />
              Surface treatment
            </p>
            <p className="font-mono tabular-nums text-teal-700">
              {usd.format(calc.usd_amounts.surface_treatment)} * (100 / {calc.inflation_index.toFixed(2)}) = {usd.format(calc.usd2022_amounts.surface_treatment)}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-lime-400/25 bg-lime-400/5 p-4">
        <p className="mb-3 font-medium text-lime-800">Step 3: Calculate Emissions</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Emission factor (kg CO2e per USD)
        </p>
        <div className="space-y-3 text-sm">
          <div className="space-y-1.5 rounded-lg border border-zinc-900/12 bg-zinc-950/5 p-3">
            <p className="flex items-center gap-2 text-muted-foreground">
              <Layers className="text-lime-400" />
              Raw material
            </p>
            <p className="font-mono tabular-nums text-lime-700">
              {usd.format(calc.usd2022_amounts.raw_material)} * {calc.factors.raw_material.toFixed(4)} = {kg.format(result.emissions.raw_material)} kg
            </p>
          </div>
          <div className="space-y-1.5 rounded-lg border border-zinc-900/12 bg-zinc-950/5 p-3">
            <p className="flex items-center gap-2 text-muted-foreground">
              <Cog className="text-teal-400" />
              Fabrication
            </p>
            <p className="font-mono tabular-nums text-lime-700">
              {usd.format(calc.usd2022_amounts.fabrication)} * {calc.factors.fabrication.toFixed(4)} = {kg.format(result.emissions.fabrication)} kg
            </p>
          </div>
          <div className="space-y-1.5 rounded-lg border border-zinc-900/12 bg-zinc-950/5 p-3">
            <p className="flex items-center gap-2 text-muted-foreground">
              <Paintbrush className="text-rose-400" />
              Surface treatment
            </p>
            <p className="font-mono tabular-nums text-lime-700">
              {usd.format(calc.usd2022_amounts.surface_treatment)} * {calc.factors.surface_treatment.toFixed(4)} = {kg.format(result.emissions.surface_treatment)} kg
            </p>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-lime-400/30 bg-lime-500/10 px-3 py-2.5 text-sm font-medium">
            <span className="text-lime-800">Total Emissions</span>
            <span className="font-mono text-lime-700 tabular-nums">{kg.format(result.emissions.total)} kg CO2e</span>
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
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [selectedHistory, setSelectedHistory] = useState<HistoryItem | null>(null)
  const [rawItems, setRawItems] = useState<{ amount: string; naics: string }[]>([
    { amount: '', naics: '331110' },
  ])
  const [fabItems, setFabItems] = useState<{ amount: string; naics: string }[]>([
    { amount: '', naics: '332710' },
  ])
  const [surfaceItems, setSurfaceItems] = useState<{ amount: string; naics: string }[]>([
    { amount: '', naics: '332812' },
  ])
  const [transportWeight, setTransportWeight] = useState<string>('')
  const [transportOrigin, setTransportOrigin] = useState<string>('China')
  const [transportPortOfLoading, setTransportPortOfLoading] = useState<string>('Port of Shanghai')
  const [transportPortOfDischarge, setTransportPortOfDischarge] = useState<string>(PORT_OF_DISCHARGE)
  const [transportMode, setTransportMode] = useState<'sea' | 'land' | 'air'>('sea')
  const [transportLoading, setTransportLoading] = useState(false)
  const [transportError, setTransportError] = useState<string | null>(null)
  const [transportResult, setTransportResult] = useState<any | null>(null)
  const selectedTransportPort = useMemo(
    () => TRANSPORT_PORTS.find((item) => item.country.toLowerCase() === transportOrigin.trim().toLowerCase()),
    [transportOrigin],
  )

  useEffect(() => {
    if (selectedTransportPort) {
      setTransportPortOfLoading(selectedTransportPort.loadingPort)
    }
  }, [selectedTransportPort])

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
      CATEGORIES.map((cat) => {
        let amount = 0
        if (cat.id === 'raw') amount = rawItems.reduce((sum, item) => sum + parseAmount(item.amount), 0)
        if (cat.id === 'fabrication') amount = fabItems.reduce((sum, item) => sum + parseAmount(item.amount), 0)
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

  function updateItem(category: CategoryId, index: number, fields: Partial<{ amount: string; naics: string }>) {
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

      setTransportResult(response)
    } catch (err) {
      setTransportError(err instanceof Error ? err.message : String(err))
    } finally {
      setTransportLoading(false)
    }
  }

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
    const demoTransportWeight = '500'
    const demoTransportOrigin = 'China'
    const demoTransportMode: 'sea' | 'land' | 'air' = 'sea'

    setForm(demoForm)
    setRawItems([{ amount: demoForm.raw_material_sgd, naics: demoForm.naics_raw_material }])
    setFabItems([{ amount: demoForm.fabrication_sgd, naics: demoForm.naics_fabrication }])
    setSurfaceItems([{ amount: demoForm.surface_treatment_sgd, naics: demoForm.naics_surface_treatment }])
    setTransportWeight(demoTransportWeight)
    setTransportOrigin(demoTransportOrigin)
    setTransportPortOfLoading('Port of Shanghai')
    setTransportPortOfDischarge(PORT_OF_DISCHARGE)
    setTransportMode(demoTransportMode)
    setTransportError(null)
    setTransportResult({
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
        raw: {},
      },
    })
    setActiveStep(1)
    setError(null)
    setResult(null)
  }

  function resetForm() {
    setForm(defaultForm)
    setRawItems([{ amount: '', naics: '331110' }])
    setFabItems([{ amount: '', naics: '332710' }])
    setSurfaceItems([{ amount: '', naics: '332812' }])
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
      const rawSum = rawItems.reduce((sum, item) => sum + parseAmount(item.amount), 0) || parseAmount(form.raw_material_sgd)
      const fabSum = fabItems.reduce((sum, item) => sum + parseAmount(item.amount), 0) || parseAmount(form.fabrication_sgd)
      const surfSum = surfaceItems.reduce((sum, item) => sum + parseAmount(item.amount), 0) || parseAmount(form.surface_treatment_sgd)

      const response = await calculateEmissions({
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
      })
      setResult(response)
      setActiveStep(2)

      const item: HistoryItem = {
        invoiceId: response.invoice_id,
        year: response.calculation.year,
        totalKgCo2e: response.emissions.total + (transportResult?.transport?.chosen_emissions_kg ?? 0),
        calc: response.calculation,
        naics: {
          raw: form.naics_raw_material.trim() || undefined,
          fabrication: form.naics_fabrication.trim() || undefined,
          surface: form.naics_surface_treatment.trim() || undefined,
        },
      }

      setHistoryItems((prev) => [item, ...prev].slice(0, 5))

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Calculation failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppBackground>
      <section className="relative z-10 mx-auto grid w-full max-w-[92rem] gap-4 pb-8 lg:grid-cols-[12rem_minmax(0,1fr)] 2xl:grid-cols-[12rem_minmax(0,1fr)_20rem]">
        <aside className="rounded-lg bg-zinc-950 p-4 text-white lg:sticky lg:top-4 lg:self-start">
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
          <div className="space-y-4">
            <div className="rounded-lg border border-zinc-900/12 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Calculation workspace</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">Invoice allocation</h2>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-md bg-zinc-950 px-4 py-3 text-white">
                    <p className="text-xs text-zinc-400">Invoice total</p>
                    <p className="mt-1 font-mono text-lg">{hasInvoiceTotal ? currency.format(totalSgd) : '—'}</p>
                  </div>
                  <div className="rounded-md bg-lime-200 px-4 py-3 text-lime-950">
                    <p className="text-xs text-lime-950/70">Allocated</p>
                    <p className="mt-1 font-mono text-lg">{allocationSum > 0 ? currency.format(allocationSum) : '—'}</p>
                  </div>
                </div>
              </div>
            </div>

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

            <Card className="gap-0 overflow-hidden border-zinc-900/12 bg-white py-0 shadow-sm">
              <CardHeader className="border-b border-zinc-900/10 bg-[#faf8f1] px-5 py-4">
                <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-md bg-zinc-950 text-sm font-semibold text-lime-300">
                      2
                    </span>
                    <div className="min-w-0">
                      <CardTitle className="whitespace-nowrap">Cost allocation</CardTitle>
                      <CardDescription className="text-sm 2xl:whitespace-nowrap">
                        Enter SGD amounts per component and assign a NAICS code for each line.
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
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
              <CardContent className="space-y-5 py-5">
                {!hasInvoiceTotal ? (
                  <div className="flex gap-3 rounded-lg border border-zinc-900/12 bg-white/70 px-3 py-2.5 text-sm text-muted-foreground">
                    <CircleDollarSign className="mt-0.5 size-4 shrink-0" />
                    Enter the invoice total above before allocating amounts.
                  </div>
                ) : null}

                <AllocationBar segments={allocationSegments} />

                <div
                  className={cn(
                    'flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm',
                    allocationValid
                      ? 'border border-lime-400/25 bg-lime-400/10 text-lime-800'
                      : 'border border-rose-400/25 bg-rose-400/10 text-rose-800',
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

                <div className="overflow-hidden rounded-lg border border-zinc-900/12">
                  <div className="w-full">
                    <div className="hidden bg-zinc-950/5 px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid md:grid-cols-[11rem_9.5rem_3rem_minmax(9.5rem,1fr)] md:gap-2">
                      <span>Component</span>
                      <span>Amount (SGD)</span>
                      <span className="text-right">Share</span>
                      <span>NAICS sector</span>
                    </div>

                    <div className="divide-y divide-zinc-900/12">
                    {categoryAmounts.map((cat) => {
                      const pct = allocationPercentages[cat.id]
                      const selectedNaics = naicsByCode.get(form[cat.naicsKey])
                      const categoryNaicsOptions = sortNaicsOptions(naicsOptions, cat.defaultNaics)

                      return (
                        <div
                          key={cat.id}
                          className={cn(
                            'grid gap-3 px-3 py-4 md:grid-cols-[11rem_9.5rem_3rem_minmax(9.5rem,1fr)] md:items-start md:gap-2',
                            cat.rowClass,
                          )}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span
                              className={cn(
                                'flex size-9 shrink-0 items-center justify-center rounded-lg border border-zinc-900/12 bg-zinc-950/5',
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
                            <Label className="text-xs sm:sr-only">{cat.label} amounts</Label>
                            <div className="space-y-2">
                              {(cat.id === 'raw' ? rawItems : cat.id === 'fabrication' ? fabItems : surfaceItems).map((item, index) => (
                                <div key={index} className="flex min-w-0 items-center gap-1.5">
                                  <Input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    placeholder="0.00"
                                    disabled={!hasInvoiceTotal}
                                    value={item.amount}
                                    onChange={(event) => updateItem(cat.id as CategoryId, index, { amount: event.target.value })}
                                    className="h-9 min-w-0 flex-1 text-right font-mono tabular-nums"
                                  />
                                  <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => removeItem(cat.id as CategoryId, index)}>
                                    <X />
                                  </Button>
                                </div>
                              ))}
                              <Button type="button" size="sm" className="h-8" onClick={() => addItem(cat.id as CategoryId)} disabled={!hasInvoiceTotal}>
                                Add
                              </Button>
                            </div>
                          </div>

                          <p
                            className={cn(
                              'text-right font-mono text-sm tabular-nums md:pt-2',
                              cat.textClass,
                            )}
                          >
                            {cat.amount > 0 ? `${pct.toFixed(1)}%` : '—'}
                          </p>

                          <div className="min-w-0 space-y-1.5 md:col-start-4">
                            <Label className="text-xs md:sr-only">{cat.label} NAICS codes</Label>
                            <div className="space-y-2">
                              {(cat.id === 'raw' ? rawItems : cat.id === 'fabrication' ? fabItems : surfaceItems).map((item, index) => (
                                <Select
                                  key={index}
                                  value={item.naics}
                                  onValueChange={(value) => updateItem(cat.id as CategoryId, index, { naics: value })}
                                >
                                  <SelectTrigger className="w-full font-mono">
                                    <SelectValue>{naicsByCode.get(item.naics)?.code ?? item.naics}</SelectValue>
                                  </SelectTrigger>
                                  <SelectContent position="popper" className="max-w-[min(24rem,calc(100vw-2rem))]">
                                    {sortNaicsOptions(naicsOptions, cat.defaultNaics).map((option) => (
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
                              ))}
                            </div>
                            <p className="text-xs leading-snug text-muted-foreground">
                              Select NAICS for each line item in the column to the left.
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
                    <CardTitle className="whitespace-nowrap">Transportation</CardTitle>
                    <CardDescription className="whitespace-nowrap text-zinc-300">Estimate transport emissions (sea / land / air) from origin country.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 py-6 sm:grid-cols-3">
                <div className="space-y-2 sm:col-span-1">
                  <Label htmlFor="transport_weight">Shipment weight (kg)</Label>
                  <Input id="transport_weight" value={transportWeight} onChange={(event) => setTransportWeight(event.target.value)} />
                </div>
                <div className="space-y-2 sm:col-span-1">
                  <Label htmlFor="transport_origin">Origin country</Label>
                  <Input
                    id="transport_origin"
                    list="transport_country_options"
                    value={transportOrigin}
                    onChange={(event) => setTransportOrigin(event.target.value)}
                    className="font-mono"
                    placeholder="Search country"
                  />
                  <datalist id="transport_country_options">
                    {TRANSPORT_COUNTRIES.map((country) => (
                      <option key={country} value={country} />
                    ))}
                  </datalist>
                  <div className="grid gap-2 rounded-lg border border-zinc-900/12 bg-zinc-950/5 p-3 text-xs">
                    <div>
                      <Label htmlFor="transport_port_loading" className="text-xs text-muted-foreground">Port of loading</Label>
                      <Input
                        id="transport_port_loading"
                        value={transportPortOfLoading}
                        onChange={(event) => setTransportPortOfLoading(event.target.value)}
                        className="mt-1 h-9 bg-white text-xs"
                        placeholder={selectedTransportPort?.loadingPort ?? 'Enter port of loading'}
                      />
                    </div>
                    <div>
                      <Label htmlFor="transport_port_discharge" className="text-xs text-muted-foreground">Port of discharge</Label>
                      <Input
                        id="transport_port_discharge"
                        value={transportPortOfDischarge}
                        onChange={(event) => setTransportPortOfDischarge(event.target.value)}
                        className="mt-1 h-9 bg-white text-xs"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-2 sm:col-span-1">
                  <Label htmlFor="transport_mode">Mode</Label>
                  <Select onValueChange={(value) => setTransportMode(value as 'sea' | 'land' | 'air')}>
                    <SelectTrigger id="transport_mode" className="w-full">
                      <SelectValue placeholder="Select mode">{transportMode}</SelectValue>
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
                      onClick={() => {
                        setTransportWeight('')
                        setTransportOrigin('China')
                        setTransportPortOfLoading('Port of Shanghai')
                        setTransportPortOfDischarge(PORT_OF_DISCHARGE)
                        setTransportMode('sea')
                        setTransportResult(null)
                        setTransportError(null)
                      }}
                    >
                      Reset
                    </Button>
                  </div>

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

            {historyItems.length > 0 ? (
              <div className="mt-4">
                <Card className="overflow-hidden border-zinc-900/12 bg-white shadow-sm">
                  <CardHeader className="border-b border-zinc-900/10 bg-[#faf8f1] pb-3">
                    <CardTitle>History</CardTitle>
                    <CardDescription>Latest 5 calculations.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="divide-y divide-zinc-900/10 overflow-hidden rounded-md border border-zinc-900/10">
                      {historyItems.map((item, idx) => (
                        <button
                          key={`${item.invoiceId}-${item.year}-${idx}`}
                          type="button"
                          onClick={() => {
                            setSelectedHistory(item)
                            setHistoryOpen(true)
                          }}
                          className="w-full bg-white px-3 py-3 text-left transition-colors hover:bg-lime-50"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="min-w-0 truncate font-mono text-sm text-lime-800">
                              {item.invoiceId}
                            </span>
                            <span className="shrink-0 font-mono text-sm text-lime-700">
                              {kg.format(item.totalKgCo2e)} kg CO₂e
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : null}

            {historyOpen && selectedHistory ? (
              <div
                role="dialog"
                aria-modal="true"
                className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/50 p-3 sm:items-center"
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget) {
                    setHistoryOpen(false)
                    setSelectedHistory(null)
                  }
                }}
              >
                <div className="w-full max-w-xl overflow-hidden rounded-lg border border-zinc-900/12 bg-white shadow-2xl">
                  <div className="flex items-start justify-between gap-3 border-b border-zinc-900/12 bg-white/70 px-4 py-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-900">Invoice</p>
                      <div className="mt-1 flex items-baseline gap-3">
                        <p className="truncate font-mono text-lg font-semibold text-lime-800">
                          {selectedHistory.invoiceId}
                        </p>

                      </div>
                    </div>
                    <button
                      type="button"
                      className="rounded-lg p-2 text-muted-foreground hover:bg-lime-50 hover:text-foreground"
                      onClick={() => {
                        setHistoryOpen(false)
                        setSelectedHistory(null)
                      }}
                    >
                      <X className="size-5" />
                    </button>
                  </div>

                  <div className="space-y-4 px-4 py-4">
                    <div className="rounded-lg border border-zinc-900/12 bg-white/70 p-4">
                      <div className="mb-2 flex items-baseline justify-between gap-3">
                        <p className="text-sm font-medium text-muted-foreground">Cost & FX</p>
                        <p className="text-xs text-muted-foreground">
                          FX rate: 1 SGD = {usd.format(selectedHistory.calc.fx_rate)} USD
                        </p>
                      </div>
                      <div className="space-y-2 text-sm">
                        {selectedHistory.calc.sgd_amounts.raw_material > 0 ? (
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">Raw material : <span className="font-mono text-lime-700 tabular-nums">{selectedHistory.naics.raw}</span></span>
                            <span className="font-mono text-lime-700 tabular-nums">
                              {currency.format(selectedHistory.calc.sgd_amounts.raw_material)} * {selectedHistory.calc.fx_rate.toFixed(4)} = {usd.format(selectedHistory.calc.usd_amounts.raw_material)}
                            </span>
                          </div>
                        ) : null}
                        {selectedHistory.calc.sgd_amounts.fabrication > 0 ? (
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">Fabrication :  <span className="font-mono text-teal-700 tabular-nums">{selectedHistory.naics.fabrication}</span></span>
                            <span className="font-mono text-teal-700 tabular-nums">
                              {currency.format(selectedHistory.calc.sgd_amounts.fabrication)} * {selectedHistory.calc.fx_rate.toFixed(4)} = {usd.format(selectedHistory.calc.usd_amounts.fabrication)}
                            </span>
                          </div>
                        ) : null}
                        {selectedHistory.calc.sgd_amounts.surface_treatment > 0 ? (
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">Surface treatment :  <span className="font-mono text-rose-700 tabular-nums">{selectedHistory.naics.surface}</span></span>
                            <span className="font-mono text-rose-700 tabular-nums">
                              {currency.format(selectedHistory.calc.sgd_amounts.surface_treatment)} * {selectedHistory.calc.fx_rate.toFixed(4)} = {usd.format(selectedHistory.calc.usd_amounts.surface_treatment)}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="rounded-lg border border-zinc-900/12 bg-white/70 p-4">
                      <div className="mb-2 flex items-baseline justify-between gap-3">
                        <p className="text-sm font-medium text-muted-foreground">Year inflation adjustment</p>
                        <p className="text-xs text-muted-foreground">
                          Inflation index: {selectedHistory.calc.inflation_index.toFixed(2)} ({selectedHistory.calc.year} to 2022)
                        </p>
                      </div>
                      <div className="space-y-2 text-sm">
                        {selectedHistory.calc.sgd_amounts.raw_material > 0 ? (
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">Raw material : <span className="font-mono text-lime-700 tabular-nums">{selectedHistory.naics.raw}</span></span>
                            <span className="font-mono text-lime-700 tabular-nums">
                              {usd.format(selectedHistory.calc.usd_amounts.raw_material)} * (100 / {selectedHistory.calc.inflation_index.toFixed(2)}) = {usd.format(selectedHistory.calc.usd2022_amounts.raw_material)}
                            </span>
                          </div>
                        ) : null}
                        {selectedHistory.calc.sgd_amounts.fabrication > 0 ? (
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">Fabrication :  <span className="font-mono text-teal-700 tabular-nums">{selectedHistory.naics.fabrication}</span></span>
                            <span className="font-mono text-teal-700 tabular-nums">
                              {usd.format(selectedHistory.calc.usd_amounts.fabrication)} * (100 / {selectedHistory.calc.inflation_index.toFixed(2)}) = {usd.format(selectedHistory.calc.usd2022_amounts.fabrication)}
                            </span>
                          </div>
                        ) : null}
                        {selectedHistory.calc.sgd_amounts.surface_treatment > 0 ? (
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">Surface treatment :  <span className="font-mono text-rose-700 tabular-nums">{selectedHistory.naics.surface}</span></span>
                            <span className="font-mono text-rose-700 tabular-nums">
                              {usd.format(selectedHistory.calc.usd_amounts.surface_treatment)} * (100 / {selectedHistory.calc.inflation_index.toFixed(2)}) = {usd.format(selectedHistory.calc.usd2022_amounts.surface_treatment)}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="rounded-lg border border-zinc-900/12 bg-white/70 p-4">
                      <p className="mb-3 text-sm font-medium text-muted-foreground">NAICS & kg CO₂e</p>
                      <div className="space-y-2 text-sm">
                        {selectedHistory.naics.raw && selectedHistory.calc.sgd_amounts.raw_material > 0 ? (
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">
                              Raw material : <span className="font-mono text-lime-700 tabular-nums">{selectedHistory.naics.raw}</span>
                            </span>
                            <span className="font-mono text-lime-700 tabular-nums">
                              {usd.format(selectedHistory.calc.usd2022_amounts.raw_material)} * {((naicsByCode.get(selectedHistory.naics.raw)?.kgco2e_per_usd ?? NaN)).toFixed(2)} = {kg.format(selectedHistory.calc.usd2022_amounts.raw_material * (naicsByCode.get(selectedHistory.naics.raw)?.kgco2e_per_usd ?? 0))} kg CO₂e
                            </span>
                          </div>
                        ) : null}
                        {selectedHistory.naics.fabrication && selectedHistory.calc.sgd_amounts.fabrication > 0 ? (
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">
                              Fabrication :  <span className="font-mono text-teal-700 tabular-nums">{selectedHistory.naics.fabrication}</span>
                            </span>
                            <span className="font-mono text-teal-700 tabular-nums">
                              {usd.format(selectedHistory.calc.usd2022_amounts.fabrication)} * {(naicsByCode.get(selectedHistory.naics.fabrication)?.kgco2e_per_usd ?? NaN).toFixed(2)} = {kg.format(selectedHistory.calc.usd2022_amounts.fabrication * (naicsByCode.get(selectedHistory.naics.fabrication)?.kgco2e_per_usd ?? 0))} kg CO₂e
                            </span>
                          </div>
                        ) : null}
                        {selectedHistory.naics.surface && selectedHistory.calc.sgd_amounts.surface_treatment > 0 ? (
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">
                              Surface treatment :  <span className="font-mono text-rose-700 tabular-nums">{selectedHistory.naics.surface}</span>
                            </span>
                            <span className="font-mono text-rose-700 tabular-nums">
                              {usd.format(selectedHistory.calc.usd2022_amounts.surface_treatment)} * {(naicsByCode.get(selectedHistory.naics.surface)?.kgco2e_per_usd ?? NaN).toFixed(2)} = {kg.format(selectedHistory.calc.usd2022_amounts.surface_treatment * (naicsByCode.get(selectedHistory.naics.surface)?.kgco2e_per_usd ?? 0))} kg CO₂e
                            </span>
                          </div>
                        ) : null}
                        {(!selectedHistory.naics.raw && !selectedHistory.naics.fabrication && !selectedHistory.naics.surface) ? (
                          <p className="text-xs text-muted-foreground">No NAICS selections found.</p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-900/12 bg-white/70 px-4 py-3">
                    <span className="text-sm font-medium text-muted-foreground">Total</span>
                    <span className="font-mono text-sm text-lime-700 tabular-nums">
                      {kg.format(selectedHistory.totalKgCo2e)} kg CO₂e
                    </span>
                  </div>
                  </div>

                  
                </div>
              </div>
            ) : null}
          </div>


          <aside className="space-y-4 lg:col-start-2 2xl:sticky 2xl:top-4 2xl:col-start-3 2xl:self-start">
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
