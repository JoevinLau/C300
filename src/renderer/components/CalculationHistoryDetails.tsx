import {
  Calculator,
  Factory,
  FileSpreadsheet,
  MapPinned,
  Route,
  Scale,
  Ship,
} from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type {
  CalculateRequest,
  CalculateResponse,
  CalculationCategory,
  Method2CalculateRequest,
  Method2CalculateResponse,
} from '../../shared/calculator-types'
import type {
  CalculationHistoryDetail,
  CalculationHistoryTransport,
} from '../../shared/calculation-history-types'

const sgd = new Intl.NumberFormat('en-SG', {
  style: 'currency',
  currency: 'SGD',
  maximumFractionDigits: 2,
})

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

const number = new Intl.NumberFormat('en-SG', {
  maximumFractionDigits: 2,
})

const preciseNumber = new Intl.NumberFormat('en-SG', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
})

const categoryMeta: Record<
  CalculationCategory,
  { label: string; dotClass: string; barClass: string }
> = {
  raw_material: {
    label: 'Raw material',
    dotClass: 'bg-lime-500',
    barClass: 'bg-lime-500',
  },
  fabrication: {
    label: 'Fabrication',
    dotClass: 'bg-teal-500',
    barClass: 'bg-teal-500',
  },
  surface_treatment: {
    label: 'Surface treatment',
    dotClass: 'bg-rose-400',
    barClass: 'bg-rose-400',
  },
}

type UseeioHistoryDetail = CalculationHistoryDetail & {
  method: 'useeio'
  request: CalculateRequest
  result: CalculateResponse
}

type Method2HistoryDetail = CalculationHistoryDetail & {
  method: 'method2'
  request: Method2CalculateRequest
  result: Method2CalculateResponse
}

function formatKg(value: number): string {
  return `${number.format(value)} kg CO2e`
}

function SectionHeading({
  eyebrow,
  title,
}: {
  eyebrow: string
  title: string
}) {
  return (
    <div className="flex items-end justify-between gap-4 border-b border-zinc-900/10 pb-3">
      <div>
        <p className="font-mono text-[0.67rem] font-semibold uppercase tracking-[0.16em] text-lime-700">
          {eyebrow}
        </p>
        <h3 className="mt-1 text-lg font-semibold tracking-tight text-zinc-950">{title}</h3>
      </div>
    </div>
  )
}

function Metric({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className={cn('min-w-0 rounded-md border border-zinc-900/10 bg-zinc-50 p-3', className)}>
      <p className="text-[0.67rem] font-semibold uppercase tracking-[0.1em] text-zinc-500">{label}</p>
      <p className="mt-1 truncate font-mono text-sm font-semibold tabular-nums text-zinc-950" title={value}>
        {value}
      </p>
    </div>
  )
}

function EmissionRow({
  label,
  value,
  max,
  barClass,
}: {
  label: string
  value: number
  max: number
  barClass: string
}) {
  const width = value <= 0 ? 0 : Math.max((value / Math.max(max, 1)) * 100, 2)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="text-zinc-700">{label}</span>
        <span className="shrink-0 font-mono font-semibold tabular-nums text-zinc-950">
          {formatKg(value)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-900/8">
        <div className={cn('h-full rounded-full', barClass)} style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

function TransportDetails({ transport }: { transport: CalculationHistoryTransport | null }) {
  if (!transport) {
    return (
      <Card className="gap-0 border-dashed py-0 shadow-none">
        <CardContent className="flex gap-3 px-4 py-4">
          <Ship className="mt-0.5 size-4 shrink-0 text-zinc-400" />
          <div>
            <p className="text-sm font-medium text-zinc-800">No transport snapshot</p>
            <p className="mt-1 text-sm leading-5 text-zinc-500">
              Transport was not included when this calculation was saved.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const routeLabel = [transport.port_of_loading, transport.port_of_discharge]
    .filter(Boolean)
    .join(' to ')

  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <CardHeader className="grid-cols-[auto_1fr] items-center gap-3 border-b border-zinc-900/10 bg-teal-50/70 px-4 py-3">
        <span className="flex size-9 items-center justify-center rounded-md bg-teal-900 text-teal-100">
          <Ship className="size-4" />
        </span>
        <div>
          <p className="text-[0.67rem] font-semibold uppercase tracking-[0.12em] text-teal-700">Transport</p>
          <CardTitle className="mt-0.5 text-sm">{routeLabel || 'Saved route'}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="grid gap-2 px-4 py-4 sm:grid-cols-2">
        <Metric label="Mode" value={transport.chosen_mode || 'Not recorded'} />
        <Metric label="Shipment weight" value={`${number.format(transport.weight_kg)} kg`} />
        <Metric
          label="Distance"
          value={transport.distance_km === null ? 'Not recorded' : `${number.format(transport.distance_km)} km`}
        />
        <Metric
          label="Transport emissions"
          value={transport.chosen_emissions_kg === null ? 'Not recorded' : formatKg(transport.chosen_emissions_kg)}
        />
        <div className="flex items-start gap-2 pt-1 text-xs leading-5 text-zinc-500 sm:col-span-2">
          <MapPinned className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {transport.origin ? `${transport.origin} · ` : ''}
            Source: {transport.source || 'Not recorded'}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function UseeioDetails({ record }: { record: UseeioHistoryDetail }) {
  const { request, result } = record
  const lineItems = result.calculation.line_items ?? []
  const categories = (['raw_material', 'fabrication', 'surface_treatment'] as const).map((category) => ({
    category,
    amountSgd: result.calculation.sgd_amounts[category],
    amountUsd2022: result.calculation.usd2022_amounts[category],
    factor: result.calculation.factors[category],
    emissions: result.emissions[category],
    naics: (() => {
      const codes = Array.from(
        new Set(
          lineItems
            .filter((item) => item.category === category)
            .map((item) => item.naics_code),
        ),
      )
      return codes.length > 1 ? 'Multiple codes' : (codes[0] ?? request.naics[category])
    })(),
  }))
  const maxEmissions = Math.max(...categories.map((item) => item.emissions), 1)

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <SectionHeading eyebrow="Snapshot" title="Calculation basis" />
        <div className="grid grid-cols-2 gap-2">
          <Metric label="Invoice spend" value={sgd.format(record.totalAmountSgd)} />
          <Metric label="Reporting year" value={String(record.year)} />
          <Metric label="SGD to USD rate" value={preciseNumber.format(result.calculation.fx_rate)} />
          <Metric label="Inflation index" value={preciseNumber.format(result.calculation.inflation_index)} />
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading eyebrow="Breakdown" title="USEEIO components" />
        <div className="space-y-4">
          {categories.map((item) => {
            const meta = categoryMeta[item.category]
            return (
              <div key={item.category} className="rounded-lg border border-zinc-900/10 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className={cn('size-2.5 shrink-0 rounded-full', meta.dotClass)} />
                    <div>
                      <p className="font-semibold text-zinc-950">{meta.label}</p>
                      <p className="mt-0.5 font-mono text-xs text-zinc-500">NAICS {item.naics}</p>
                    </div>
                  </div>
                  <p className="font-mono text-sm font-semibold tabular-nums text-zinc-950">
                    {formatKg(item.emissions)}
                  </p>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-900/8">
                  <div
                    className={cn('h-full rounded-full', meta.barClass)}
                    style={{
                      width:
                        item.emissions <= 0
                          ? '0%'
                          : `${Math.max((item.emissions / maxEmissions) * 100, 2)}%`,
                    }}
                  />
                </div>
                <p className="mt-3 font-mono text-xs leading-5 text-zinc-500">
                  {sgd.format(item.amountSgd)} → {usd.format(item.amountUsd2022)} (2022) ×{' '}
                  {preciseNumber.format(item.factor)} kg CO2e/2022 USD
                </p>
              </div>
            )
          })}
        </div>
      </section>

      {lineItems.length > 0 ? (
        <section className="space-y-3">
          <SectionHeading eyebrow="Audit trail" title="Saved line items" />
          <div className="overflow-hidden rounded-lg border border-zinc-900/10">
            <div className="hidden grid-cols-[1.1fr_0.8fr_0.8fr] gap-3 bg-zinc-950 px-4 py-2.5 text-[0.67rem] font-semibold uppercase tracking-[0.08em] text-zinc-300 sm:grid">
              <span>Component / NAICS</span>
              <span className="text-right">2022 USD × factor</span>
              <span className="text-right">Emissions</span>
            </div>
            {lineItems.map((item, index) => (
              <div
                key={`${item.category}-${item.naics_code}-${index}`}
                className="grid gap-2 border-t border-zinc-900/8 px-4 py-3 first:border-t-0 sm:grid-cols-[1.1fr_0.8fr_0.8fr] sm:items-center"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-900">{categoryMeta[item.category].label}</p>
                  <p className="font-mono text-xs text-zinc-500">{item.naics_code}</p>
                </div>
                <p className="font-mono text-xs tabular-nums text-zinc-600 sm:text-right">
                  {usd.format(item.amount_usd2022)} × {preciseNumber.format(item.factor)}
                </p>
                <p className="font-mono text-sm font-semibold tabular-nums text-zinc-950 sm:text-right">
                  {formatKg(item.emission)}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <SectionHeading eyebrow="Logistics" title="Transport context" />
        <TransportDetails transport={record.transport} />
      </section>
    </div>
  )
}

function Method2Details({ record }: { record: Method2HistoryDetail }) {
  const { request, result } = record
  const emissionRows = [
    { label: 'Raw material', value: result.emissions.raw_material, barClass: 'bg-lime-500' },
    { label: 'Transportation', value: result.emissions.transportation, barClass: 'bg-sky-500' },
    { label: 'Machining', value: result.emissions.machining, barClass: 'bg-teal-500' },
    { label: 'Surface treatment', value: result.emissions.surface_treatment, barClass: 'bg-rose-400' },
  ]
  const maxEmissions = Math.max(...emissionRows.map((item) => item.value), 1)

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <SectionHeading eyebrow="Snapshot" title="Method 2 basis" />
        <div className="grid grid-cols-2 gap-2">
          <Metric label="Raw material spend" value={sgd.format(request.raw_material_sgd)} />
          <Metric label="Surface treatment" value={sgd.format(request.surface_treatment_sgd)} />
          <Metric label="Reporting year" value={String(request.year)} />
          <Metric label="Machine entries" value={String(result.machining.entries.length)} />
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading eyebrow="Breakdown" title="Emissions by activity" />
        <Card className="gap-0 py-0 shadow-none">
          <CardContent className="space-y-4 px-4 py-4">
            {emissionRows.map((item) => (
              <EmissionRow key={item.label} {...item} max={maxEmissions} />
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHeading eyebrow="Production" title="Machining entries" />
        {result.machining.entries.length > 0 ? (
          <div className="space-y-2">
            {result.machining.entries.map((entry, index) => (
              <Card key={`${entry.machineType}-${entry.dutyLevel}-${index}`} className="gap-0 py-0 shadow-none">
                <CardContent className="px-4 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-teal-950 text-teal-200">
                        <Factory className="size-4" />
                      </span>
                      <div>
                        <p className="font-semibold text-zinc-950">{entry.machineType}</p>
                        <p className="mt-0.5 text-xs text-zinc-500">{entry.dutyLevel} duty</p>
                      </div>
                    </div>
                    <p className="shrink-0 font-mono text-sm font-semibold tabular-nums">
                      {formatKg(entry.emissions)}
                    </p>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs text-zinc-500">
                    <span>{number.format(entry.operatingHours)} operating hr</span>
                    <span className="text-right">{number.format(entry.avgKW)} kW average</span>
                  </div>
                  <p className="mt-2 border-t border-zinc-900/8 pt-2 font-mono text-xs text-zinc-500">
                    {number.format(entry.operatingHours)} hr × {preciseNumber.format(entry.hourlyEmission)} kg CO2e/hr
                  </p>
                </CardContent>
              </Card>
            ))}
            <div className="flex items-center justify-between rounded-md bg-teal-950 px-4 py-3 text-sm text-white">
              <span className="flex items-center gap-2 font-medium">
                <Calculator className="size-4 text-teal-200" /> Machining subtotal
              </span>
              <span className="font-mono font-semibold tabular-nums">{formatKg(result.machining.total)}</span>
            </div>
          </div>
        ) : (
          <Card className="gap-0 border-dashed py-0 shadow-none">
            <CardContent className="px-4 py-4 text-sm text-zinc-500">
              No machining entries were saved with this calculation.
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeading eyebrow="Spend model" title="Cost-based components" />
        <div className="grid gap-2 sm:grid-cols-2">
          <Card className="gap-0 py-0 shadow-none">
            <CardContent className="px-4 py-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-950">
                <Scale className="size-4 text-lime-700" /> Raw material
              </div>
              <p className="mt-3 font-mono text-xs leading-5 text-zinc-500">
                NAICS {request.naics.raw_material}<br />
                {usd.format(result.calculation.usd2022_amounts.raw_material)} ×{' '}
                {preciseNumber.format(result.calculation.factors.raw_material)}
              </p>
              <p className="mt-2 font-mono text-sm font-semibold">{formatKg(result.emissions.raw_material)}</p>
            </CardContent>
          </Card>
          <Card className="gap-0 py-0 shadow-none">
            <CardContent className="px-4 py-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-950">
                <FileSpreadsheet className="size-4 text-rose-600" /> Surface treatment
              </div>
              <p className="mt-3 font-mono text-xs leading-5 text-zinc-500">
                NAICS {request.naics.surface_treatment}<br />
                {usd.format(result.calculation.usd2022_amounts.surface_treatment)} ×{' '}
                {preciseNumber.format(result.calculation.factors.surface_treatment)}
              </p>
              <p className="mt-2 font-mono text-sm font-semibold">{formatKg(result.emissions.surface_treatment)}</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeading eyebrow="Logistics" title="Transport calculation" />
        <TransportDetails transport={record.transport} />
        <div className="flex items-start gap-2 rounded-md bg-zinc-100 px-3 py-2.5 text-xs leading-5 text-zinc-600">
          <Route className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Method 2 stored {formatKg(result.transport.emissions)} from {result.transport.source || 'the saved transport source'}.
          </span>
        </div>
      </section>
    </div>
  )
}

export function CalculationHistoryDetails({ record }: { record: CalculationHistoryDetail }) {
  if (record.method === 'useeio') {
    return <UseeioDetails record={record as UseeioHistoryDetail} />
  }

  return <Method2Details record={record as Method2HistoryDetail} />
}
