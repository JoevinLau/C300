import {
  AlertCircle,
  CheckCircle2,
  CircleDollarSign,
  Cog,
  Paintbrush,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

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
import { cn } from '@/lib/utils'
import type { EcoTransitResponse, NaicsOption } from '../../shared/calculator-types'
import { Layers } from 'lucide-react'

export const currency = new Intl.NumberFormat('en-SG', {
  style: 'currency',
  currency: 'SGD',
  maximumFractionDigits: 2,
})

export function parseAmount(value: string): number {
  const normalized = String(value).trim().replace(/,/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

export function pctFromAmount(amount: number, total: number): number {
  if (total <= 0) return 0
  return (amount / total) * 100
}

export type Method1FormKey =
  | 'invoice_id'
  | 'year'
  | 'total_amount_sgd'
  | 'raw_material_sgd'
  | 'fabrication_sgd'
  | 'surface_treatment_sgd'
  | 'naics_raw_material'
  | 'naics_fabrication'
  | 'naics_surface_treatment'

export type CategoryId = 'raw' | 'fabrication' | 'surface'
export type LineItem = { amount: string; naics: string }

export const METHOD1_CATEGORIES: {
  id: CategoryId
  amountKey: Method1FormKey
  naicsKey: Method1FormKey
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

export const METHOD1_STEPS = [
  { id: 1, title: 'Invoice', description: 'Spend record' },
  { id: 2, title: 'Allocation', description: 'Amounts & NAICS' },
] as const

export const PORT_OF_DISCHARGE = 'Singapore'

export const TRANSPORT_PORTS = [
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

function sortNaicsOptions(options: NaicsOption[], preferredCode: string): NaicsOption[] {
  return [...options].sort((a, b) => {
    if (a.code === preferredCode) return -1
    if (b.code === preferredCode) return 1
    return a.code.localeCompare(b.code)
  })
}

export function SearchableNaicsSelect({
  value,
  options,
  preferredCode,
  naicsByCode,
  onChange,
}: {
  value: string
  options: NaicsOption[]
  preferredCode: string
  naicsByCode: Map<string, NaicsOption>
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [menuRect, setMenuRect] = useState<{
    left: number
    top: number
    width: number
    maxHeight: number
  } | null>(null)
  const selected = naicsByCode.get(value)
  const sortedOptions = useMemo(() => sortNaicsOptions(options, preferredCode), [options, preferredCode])
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return sortedOptions

    return sortedOptions.filter((option) => {
      if (/^\d+$/.test(normalizedQuery)) {
        return option.code.startsWith(normalizedQuery)
      }

      const searchable = `${option.code} ${option.description} ${option.category ?? ''}`.toLowerCase()
      return searchable.includes(normalizedQuery)
    })
  }, [query, sortedOptions])
  const inputValue = open ? query : value
  const selectedFactor = selected?.kgco2e_per_usd

  useEffect(() => {
    if (!open) return

    const updateMenuRect = () => {
      const rect = inputRef.current?.getBoundingClientRect()
      if (!rect) return

      const gap = 4
      const pagePadding = 12
      const spaceBelow = window.innerHeight - rect.bottom - pagePadding
      const spaceAbove = rect.top - pagePadding
      const opensAbove = spaceBelow < 220 && spaceAbove > spaceBelow
      const maxHeight = Math.max(160, Math.min(320, opensAbove ? spaceAbove - gap : spaceBelow - gap))

      setMenuRect({
        left: rect.left,
        top: opensAbove ? rect.top - gap - maxHeight : rect.bottom + gap,
        width: rect.width,
        maxHeight,
      })
    }

    updateMenuRect()
    window.addEventListener('resize', updateMenuRect)
    window.addEventListener('scroll', updateMenuRect, true)

    return () => {
      window.removeEventListener('resize', updateMenuRect)
      window.removeEventListener('scroll', updateMenuRect, true)
    }
  }, [open])

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={inputValue}
        onFocus={() => {
          setQuery('')
          setOpen(true)
        }}
        onBlur={() => {
          window.setTimeout(() => {
            setOpen(false)
            setQuery('')
          }, 120)
        }}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        placeholder="Search NAICS"
        className="h-9 font-mono tabular-nums"
        autoComplete="off"
      />
      {open && menuRect
        ? createPortal(
            <div
              className="fixed z-[1000] overflow-y-auto rounded-lg border border-zinc-900/15 bg-white p-1 shadow-xl"
              style={{
                left: menuRect.left,
                top: menuRect.top,
                width: menuRect.width,
                maxHeight: menuRect.maxHeight,
              }}
            >
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => (
                  <button
                    key={option.code}
                    type="button"
                    className={cn(
                      'flex w-full flex-col gap-0.5 rounded-md px-2 py-2 text-left text-sm outline-none hover:bg-lime-100 focus:bg-lime-100',
                      option.code === value && 'bg-lime-50',
                    )}
                    onMouseDown={(event) => {
                      event.preventDefault()
                      onChange(option.code)
                      setQuery('')
                      setOpen(false)
                    }}
                  >
                    <span className="flex w-full items-center justify-between gap-3">
                      <span className="font-mono font-medium text-zinc-950">{option.code}</span>
                      {typeof option.kgco2e_per_usd === 'number' ? (
                        <span className="shrink-0 font-mono text-xs text-lime-700">
                          {option.kgco2e_per_usd.toFixed(3)} kgCO2e/USD
                        </span>
                      ) : null}
                    </span>
                    <span className="text-xs leading-snug text-muted-foreground">{option.description}</span>
                  </button>
                ))
              ) : (
                <p className="px-2 py-3 text-sm text-muted-foreground">No NAICS matches</p>
              )}
            </div>,
            document.body,
          )
        : null}
      {selected ? (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span className="line-clamp-1">{selected.description}</span>
          {typeof selectedFactor === 'number' ? (
            <span className="font-mono text-lime-700">
              {selectedFactor.toFixed(3)} kgCO2e/USD
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function Method1StepIndicator({
  steps = METHOD1_STEPS,
  activeStep,
}: {
  steps?: readonly { id: number; title: string; description: string }[]
  activeStep: number
}) {
  return (
    <ol className="grid w-full gap-2 overflow-hidden">
      {steps.map((step) => {
        const isActive = step.id === activeStep
        const isDone = step.id < activeStep
        return (
          <li
            key={step.id}
            className={cn(
              'flex w-full min-w-0 items-center gap-3 rounded-md border px-3 py-2.5 transition-colors',
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
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium leading-5">{step.title}</span>
              <span className={cn('mt-0.5 block truncate text-xs leading-4', isActive ? 'text-zinc-700' : 'text-zinc-400')}>
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
              {seg.amount > 0 ? currency.format(seg.amount) : '-'}
            </p>
          </div>
        ))}
      </div>
      {barTotal > 0 ? (
        <div className="border-t border-zinc-900/12 px-3 py-2 text-right text-xs text-muted-foreground">
          Allocated total <span className="font-mono font-medium text-foreground tabular-nums">{currency.format(barTotal)}</span>
        </div>
      ) : null}
    </div>
  )
}

export function Method1SpendInputSections({
  form,
  hasInvoiceTotal,
  totalSgd,
  allocationSum,
  allocationValid,
  remaining,
  allocationSegments,
  allocationPercentages,
  naicsOptions,
  naicsByCode,
  rawItems,
  fabItems,
  surfaceItems,
  updateField,
  updateItem,
  addItem,
  removeItem,
  applyDefaultSplit,
  distributeEqually,
  visibleCategories = ['raw', 'fabrication', 'surface'],
  showPresetButtons = true,
  mergeInvoiceFieldsIntoAllocation = false,
  allocationTitle = 'Cost allocation',
  allocationDescription = 'Enter SGD amounts per component and assign a NAICS code for each line.',
  allocationStepLabel = '2',
  showTotalAmount = true,
  showAllocationSummary = true,
  showShareColumn = true,
  showYearInHeader = true,
  showYearColumn = false,
  showAllocationStepBadge = true,
  showNaicsFactorDetails = false,
}: {
  form: Record<Method1FormKey, string>
  hasInvoiceTotal: boolean
  totalSgd: number
  allocationSum: number
  allocationValid: boolean
  remaining: number
  allocationSegments: { pct: number; amount: number; className: string; label: string }[]
  allocationPercentages: Record<CategoryId, number>
  naicsOptions: NaicsOption[]
  naicsByCode: Map<string, NaicsOption>
  rawItems: LineItem[]
  fabItems: LineItem[]
  surfaceItems: LineItem[]
  updateField: (key: Method1FormKey, value: string) => void
  updateItem: (category: CategoryId, index: number, fields: Partial<LineItem>) => void
  addItem: (category: CategoryId) => void
  removeItem: (category: CategoryId, index: number) => void
  applyDefaultSplit: () => void
  distributeEqually: () => void
  visibleCategories?: CategoryId[]
  showPresetButtons?: boolean
  mergeInvoiceFieldsIntoAllocation?: boolean
  allocationTitle?: string
  allocationDescription?: string
  allocationStepLabel?: string
  showTotalAmount?: boolean
  showAllocationSummary?: boolean
  showShareColumn?: boolean
  showYearInHeader?: boolean
  showYearColumn?: boolean
  showAllocationStepBadge?: boolean
  showNaicsFactorDetails?: boolean
}) {
  const categories = METHOD1_CATEGORIES.filter((cat) => visibleCategories.includes(cat.id))
  const categoryAmounts = categories.map((cat) => {
    let amount = 0
    if (cat.id === 'raw') amount = rawItems.reduce((sum, item) => sum + parseAmount(item.amount), 0)
    if (cat.id === 'fabrication') amount = fabItems.reduce((sum, item) => sum + parseAmount(item.amount), 0)
    if (cat.id === 'surface') amount = surfaceItems.reduce((sum, item) => sum + parseAmount(item.amount), 0)
    if (amount === 0) amount = parseAmount(form[cat.amountKey])
    return { ...cat, amount }
  })

  return (
    <>
      {!mergeInvoiceFieldsIntoAllocation ? (
        <Card className="gap-0 overflow-hidden border-zinc-900/12 bg-white py-0 shadow-sm">
          <CardHeader className="border-b border-zinc-900/10 bg-zinc-950 px-5 py-4 text-white">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-md bg-lime-300 text-sm font-semibold text-zinc-950">1</span>
              <div>
                <CardTitle>Invoice details</CardTitle>
                <CardDescription className="text-zinc-300">Spend record and reporting year for FX adjustment.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 py-6 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="invoice_id">Invoice ID</Label>
              <Input id="invoice_id" placeholder="INV-2024-001" value={form.invoice_id} onChange={(e) => updateField('invoice_id', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="year">Year</Label>
              <Input id="year" type="number" min={2020} max={2030} value={form.year} onChange={(e) => updateField('year', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="total_amount_sgd" className="flex items-center gap-1.5">
                <CircleDollarSign className="size-3.5 text-muted-foreground" />
                Total amount (SGD)
              </Label>
              <Input id="total_amount_sgd" type="number" min={0} step="0.01" placeholder="2,614.00" value={form.total_amount_sgd} onChange={(e) => updateField('total_amount_sgd', e.target.value)} />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="gap-0 overflow-hidden border-zinc-900/12 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-zinc-900/10 bg-[#faf8f1] px-5 py-4">
          <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              {showAllocationStepBadge ? (
                <span className="flex size-9 items-center justify-center rounded-md bg-zinc-950 text-sm font-semibold text-lime-300">{allocationStepLabel}</span>
              ) : null}
              <div className="min-w-0">
                <CardTitle className="whitespace-nowrap">{allocationTitle}</CardTitle>
                <CardDescription className="text-sm 2xl:whitespace-nowrap">
                  {allocationDescription}
                </CardDescription>
              </div>
            </div>
            {showPresetButtons ? (
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={applyDefaultSplit} disabled={!hasInvoiceTotal}>50 / 35 / 15</Button>
                <Button type="button" variant="ghost" size="sm" onClick={distributeEqually} disabled={!hasInvoiceTotal}>Split equally</Button>
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-5 py-5">
          {mergeInvoiceFieldsIntoAllocation && showYearInHeader ? (
            <div className={cn('grid gap-4', showTotalAmount && 'sm:grid-cols-2')}>
              <div className="space-y-2">
                <Label htmlFor="year">Year</Label>
                <Input id="year" type="number" min={2020} max={2030} value={form.year} onChange={(e) => updateField('year', e.target.value)} />
              </div>
              {showTotalAmount ? (
                <div className="space-y-2">
                  <Label htmlFor="total_amount_sgd" className="flex items-center gap-1.5">
                    <CircleDollarSign className="size-3.5 text-muted-foreground" />
                    Total amount (SGD)
                  </Label>
                  <Input id="total_amount_sgd" type="number" min={0} step="0.01" placeholder="2,614.00" value={form.total_amount_sgd} onChange={(e) => updateField('total_amount_sgd', e.target.value)} />
                </div>
              ) : null}
            </div>
          ) : null}

          {showAllocationSummary && !hasInvoiceTotal ? (
            <div className="flex gap-3 rounded-lg border border-zinc-900/12 bg-white/70 px-3 py-2.5 text-sm text-muted-foreground">
              <CircleDollarSign className="mt-0.5 size-4 shrink-0" />
              Enter the invoice total above before allocating amounts.
            </div>
          ) : null}

          {showAllocationSummary ? <AllocationBar segments={allocationSegments} /> : null}

          {showAllocationSummary ? (
          <div className={cn('flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm', allocationValid ? 'border border-lime-400/25 bg-lime-400/10 text-lime-800' : 'border border-rose-400/25 bg-rose-400/10 text-rose-800')}>
            <span className="flex items-center gap-2">
              {allocationValid ? <CheckCircle2 className="size-4 shrink-0" /> : <AlertCircle className="size-4 shrink-0" />}
              {allocationValid
                ? 'Line items match invoice total'
                : hasInvoiceTotal
                  ? remaining > 0
                    ? `${currency.format(remaining)} remaining to allocate`
                    : `${currency.format(Math.abs(remaining))} over invoice total`
                  : 'Waiting for invoice total'}
            </span>
            <span className="font-mono font-semibold tabular-nums">{currency.format(allocationSum)}{hasInvoiceTotal ? ` / ${currency.format(totalSgd)}` : ''}</span>
          </div>
          ) : null}

          <div className="overflow-hidden rounded-lg border border-zinc-900/12">
            <div
              className={cn(
                'hidden bg-zinc-950/5 px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid md:gap-2',
                showYearColumn && showShareColumn
                  ? 'md:grid-cols-[11rem_9.5rem_6.5rem_3rem_minmax(9.5rem,1fr)]'
                  : showYearColumn
                    ? 'md:grid-cols-[11rem_9.5rem_6.5rem_minmax(9.5rem,1fr)]'
                    : showShareColumn
                      ? 'md:grid-cols-[11rem_9.5rem_3rem_minmax(9.5rem,1fr)]'
                      : 'md:grid-cols-[11rem_9.5rem_minmax(9.5rem,1fr)]',
              )}
            >
              <span>Component</span>
              <span>Amount (SGD)</span>
              {showYearColumn ? <span>Year</span> : null}
              {showShareColumn ? <span className="text-right">Share</span> : null}
              <span>NAICS sector</span>
            </div>
            <div className="divide-y divide-zinc-900/12">
              {categoryAmounts.map((cat) => {
                const pct = allocationPercentages[cat.id]
                const items = cat.id === 'raw' ? rawItems : cat.id === 'fabrication' ? fabItems : surfaceItems
                return (
                  <div
                    key={cat.id}
                    className={cn(
                      'grid gap-3 px-3 py-4 md:items-start md:gap-2',
                      showYearColumn && showShareColumn
                        ? 'md:grid-cols-[11rem_9.5rem_6.5rem_3rem_minmax(9.5rem,1fr)]'
                        : showYearColumn
                          ? 'md:grid-cols-[11rem_9.5rem_6.5rem_minmax(9.5rem,1fr)]'
                          : showShareColumn
                            ? 'md:grid-cols-[11rem_9.5rem_3rem_minmax(9.5rem,1fr)]'
                            : 'md:grid-cols-[11rem_9.5rem_minmax(9.5rem,1fr)]',
                      cat.rowClass,
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg border border-zinc-900/12 bg-zinc-950/5', cat.textClass)}>
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
                        {items.map((item, index) => (
                          <div key={index} className="flex min-w-0 items-center gap-1.5">
                            <Input type="number" min={0} step="0.01" placeholder="0.00" disabled={!hasInvoiceTotal} value={item.amount} onChange={(event) => updateItem(cat.id, index, { amount: event.target.value })} className="h-9 min-w-0 flex-1 text-right font-mono tabular-nums" />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={() => removeItem(cat.id, index)}
                              disabled={items.length <= 1}
                              aria-label={`Remove ${cat.label} entry ${index + 1}`}
                            >
                              <X />
                            </Button>
                          </div>
                        ))}
                        <Button type="button" size="sm" className="h-8" onClick={() => addItem(cat.id)} disabled={!hasInvoiceTotal}>Add</Button>
                      </div>
                    </div>
                    {showYearColumn ? (
                      <div className="space-y-1">
                        <Label className="text-xs md:sr-only">{cat.label} year</Label>
                        <Input type="number" min={2020} max={2030} value={form.year} onChange={(event) => updateField('year', event.target.value)} className="h-9 font-mono tabular-nums" />
                      </div>
                    ) : null}
                    {showShareColumn ? (
                      <p className={cn('text-right font-mono text-sm tabular-nums md:pt-2', cat.textClass)}>{cat.amount > 0 ? `${pct.toFixed(1)}%` : '-'}</p>
                    ) : null}
                    <div className={cn('min-w-0 space-y-1.5', showYearColumn && showShareColumn ? 'md:col-start-5' : showYearColumn ? 'md:col-start-4' : showShareColumn ? 'md:col-start-4' : 'md:col-start-3')}>
                      <Label className="text-xs md:sr-only">{cat.label} NAICS codes</Label>
                      <div className="space-y-2">
                        {items.map((item, index) => (
                          <div key={index} className="space-y-1.5">
                            <SearchableNaicsSelect
                              value={item.naics}
                              options={naicsOptions}
                              preferredCode={cat.defaultNaics}
                              naicsByCode={naicsByCode}
                              onChange={(value) => updateItem(cat.id, index, { naics: value })}
                            />
                            {showNaicsFactorDetails ? (
                              <p className="text-[11px] leading-snug text-muted-foreground">
                                {naicsByCode.get(item.naics)?.kgco2e_per_usd != null
                                  ? `${naicsByCode.get(item.naics)?.kgco2e_per_usd?.toFixed(4)} kg CO2e/USD from the Method 1 NAICS database`
                                  : naicsOptions.length > 0
                                    ? 'No factor returned for this NAICS code'
                                    : 'Loading NAICS factors from the Method 1 database'}
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                      <p className="text-xs leading-snug text-muted-foreground">Type a code or keyword to filter NAICS options.</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  )
}

export function Method1TransportationSection({
  transportWeight,
  transportOrigin,
  transportPortOfLoading,
  transportPortOfDischarge,
  transportMode,
  transportLoading,
  transportError,
  transportResult,
  selectedTransportPort,
  setTransportWeight,
  setTransportOrigin,
  setTransportPortOfLoading,
  setTransportPortOfDischarge,
  setTransportMode,
  setTransportResult,
  setTransportError,
  handleTransportCalculate,
}: {
  transportWeight: string
  transportOrigin: string
  transportPortOfLoading: string
  transportPortOfDischarge: string
  transportMode: 'sea' | 'land' | 'air'
  transportLoading: boolean
  transportError: string | null
  transportResult: EcoTransitResponse | null
  selectedTransportPort?: { country: string; loadingPort: string }
  setTransportWeight: (value: string) => void
  setTransportOrigin: (value: string) => void
  setTransportPortOfLoading: (value: string) => void
  setTransportPortOfDischarge: (value: string) => void
  setTransportMode: (value: 'sea' | 'land' | 'air') => void
  setTransportResult: (value: EcoTransitResponse | null) => void
  setTransportError: (value: string | null) => void
  handleTransportCalculate: (event?: React.SyntheticEvent) => void
}) {
  return (
    <Card className="gap-0 overflow-hidden border-zinc-900/12 bg-white py-0 shadow-sm">
      <CardHeader className="border-b border-zinc-900/10 bg-zinc-950 px-5 py-4 text-white">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-md bg-lime-300 text-sm font-semibold text-zinc-950">T</span>
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
          <Input id="transport_origin" list="transport_country_options" value={transportOrigin} onChange={(event) => setTransportOrigin(event.target.value)} className="font-mono" placeholder="Search country" />
          <datalist id="transport_country_options">
            {TRANSPORT_COUNTRIES.map((country) => <option key={country} value={country} />)}
          </datalist>
          <div className="grid gap-2 rounded-lg border border-zinc-900/12 bg-zinc-950/5 p-3 text-xs">
            <div>
              <Label htmlFor="transport_port_loading" className="text-xs text-muted-foreground">Port of loading</Label>
              <Input id="transport_port_loading" value={transportPortOfLoading} onChange={(event) => setTransportPortOfLoading(event.target.value)} className="mt-1 h-9 bg-white text-xs" placeholder={selectedTransportPort?.loadingPort ?? 'Enter port of loading'} />
            </div>
            <div>
              <Label htmlFor="transport_port_discharge" className="text-xs text-muted-foreground">Port of discharge</Label>
              <Input id="transport_port_discharge" value={transportPortOfDischarge} onChange={(event) => setTransportPortOfDischarge(event.target.value)} className="mt-1 h-9 bg-white text-xs" />
            </div>
          </div>
        </div>
        <div className="space-y-2 sm:col-span-1">
          <Label htmlFor="transport_mode">Mode</Label>
          <Select value={transportMode} onValueChange={(value) => setTransportMode(value as 'sea' | 'land' | 'air')}>
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
            <Button type="button" size="sm" onClick={handleTransportCalculate} disabled={transportLoading}>{transportLoading ? 'Calculating...' : 'Calculate transport'}</Button>
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

          {transportError ? <div className="mt-3 text-rose-600">{transportError}</div> : null}

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
                  EcoTransit ({transportResult.transport.chosen_mode}): {transportResult.transport.chosen_emissions_kg != null ? `${Number(transportResult.transport.chosen_emissions_kg).toFixed(2)} kg CO2e` : 'No emissions value found in EcoTransit response'}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">Source: {transportResult.transport.source}</div>
              </div>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
