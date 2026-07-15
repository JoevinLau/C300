import { useState } from 'react'
import {
  AlertCircle,
  Calculator,
  ChevronDown,
  Cog,
  Download,
  Layers,
  Loader2,
  Paintbrush,
} from 'lucide-react'
import { PDFDownloadLink } from '@react-pdf/renderer'
import {
  METHOD1_CATEGORIES as CATEGORIES,
  currency,
} from '@/components/Method1SharedInputs'
import { UseeioResultsPdf } from '@/components/UseeioResultsPdf'
import { Button, buttonVariants } from '@/components/ui/button'
import type {
  CalculateResponse,
  CalculationLineItemResult,
  EcoTransitResponse,
  NaicsOption,
} from '@/lib/calculator-api'
import { cn } from '@/lib/utils'

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

const kg = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
})

const categoryMetaByKey = {
  raw_material: { label: 'Raw material', icon: Layers, textClass: 'text-lime-700' },
  fabrication: { label: 'Fabrication', icon: Cog, textClass: 'text-teal-700' },
  surface_treatment: { label: 'Surface treatment', icon: Paintbrush, textClass: 'text-rose-700' },
} as const

function getLineItemLabel(item: CalculationLineItemResult, index: number, naicsByCode: Map<string, NaicsOption>) {
  const meta = categoryMetaByKey[item.category]
  const description = naicsByCode.get(item.naics_code)?.description
  return `${meta.label} ${index + 1} - ${item.naics_code}${description ? ` ${description}` : ''}`
}

export function EmissionsBreakdownChart({
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
export function ResultsPanel({
  result,
  loading,
  error,
  totalSgd,
  year,
  transport,
  naicsByCode,
}: {
  result: CalculateResponse | null
  loading: boolean
  error: string | null
  totalSgd: number
  year: string
  transport?: EcoTransitResponse | null
  naicsByCode: Map<string, NaicsOption>
}) {
  const [lineItemsOpen, setLineItemsOpen] = useState(false)

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
          {kg.format(combinedEmissions)}
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
              : '-'}{' '}
            <span className="text-xs font-sans text-muted-foreground">kg/USD</span>
          </p>
        </div>
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

      <div className="border-t border-zinc-900/12 pt-4">
        <p className="mb-3 text-sm font-medium text-muted-foreground">Emissions by component</p>
        <EmissionsBreakdownChart result={result} />
      </div>

      {result.calculation.line_items?.length ? (
        <div className="space-y-2 border-t border-zinc-900/12 pt-4">
          <Button
            type="button"
            variant="ghost"
            className="h-auto w-full justify-between px-0 py-1 text-left text-sm font-medium text-muted-foreground hover:bg-transparent hover:text-foreground"
            onClick={() => setLineItemsOpen((open) => !open)}
            aria-expanded={lineItemsOpen}
          >
            <span>Line item emission calculations</span>
            <ChevronDown className={cn('size-4 transition-transform', lineItemsOpen && 'rotate-180')} />
          </Button>
          {lineItemsOpen ? (
            <div className="space-y-2">
              {result.calculation.line_items.map((item, index) => {
                const meta = categoryMetaByKey[item.category]
                const Icon = meta.icon
                return (
                  <div key={`${item.category}-${item.naics_code}-${index}`} className="rounded-lg border border-zinc-900/12 bg-white/70 px-3 py-2.5 text-sm">
                    <div className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1">
                      <Icon className={cn('mt-0.5 size-4 shrink-0', meta.textClass)} />
                      <span className="min-w-0 font-medium">{getLineItemLabel(item, index, naicsByCode)}</span>
                      <span className={cn('shrink-0 font-mono tabular-nums', meta.textClass)}>{kg.format(item.emission)} kg</span>
                      <span />
                      <p className="col-start-2 font-mono text-xs text-muted-foreground">
                        {usd.format(item.amount_usd2022)} * {item.factor.toFixed(4)} kgCO2e/USD
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>
      ) : null}

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

      <PDFDownloadLink
        className={buttonVariants({ className: 'w-full' })}
        document={
          <UseeioResultsPdf
            result={result}
            totalSgd={totalSgd}
            transport={transport}
          />
        }
        fileName={`useeio-${result.invoice_id.replace(/[^a-z0-9_-]+/gi, '-')}.pdf`}
      >
        {({ loading: preparingPdf }: { loading: boolean }) => (
          <>
            {preparingPdf ? <Loader2 className="animate-spin" /> : <Download />}
            {preparingPdf ? 'Preparing PDF…' : 'Download PDF'}
          </>
        )}
      </PDFDownloadLink>
    </div>
  )
}

export function CalculationProcessPanel({
  result,
  loading,
  naicsByCode,
}: {
  result: CalculateResponse | null
  loading: boolean
  naicsByCode: Map<string, NaicsOption>
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
          Each line item uses its own NAICS factor (kg CO2e per USD), then totals are grouped by component.
        </p>
        <div className="space-y-3 text-sm">
          {calc.line_items?.length ? (
            calc.line_items.map((item, index) => {
              const meta = categoryMetaByKey[item.category]
              const Icon = meta.icon
              return (
                <div key={`${item.category}-${item.naics_code}-${index}`} className="rounded-lg border border-zinc-900/12 bg-zinc-950/5 p-3">
                  <div className="grid grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-2 gap-y-1">
                    <Icon className={cn('mt-0.5 size-4 shrink-0', meta.textClass)} />
                    <p className="text-muted-foreground">
                      {getLineItemLabel(item, index, naicsByCode)}
                    </p>
                    <span />
                    <p className="col-start-2 font-mono tabular-nums text-lime-700">
                    {usd.format(item.amount_usd2022)} * {item.factor.toFixed(4)} = {kg.format(item.emission)} kg
                    </p>
                  </div>
                </div>
              )
            })
          ) : (
            <>
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
            </>
          )}
          <div className="flex items-center justify-between rounded-lg border border-lime-400/30 bg-lime-500/10 px-3 py-2.5 text-sm font-medium">
            <span className="text-lime-800">Total Emissions</span>
            <span className="font-mono text-lime-700 tabular-nums">{kg.format(result.emissions.total)} kg CO2e</span>
          </div>
        </div>
      </div>
    </div>
  )
}
