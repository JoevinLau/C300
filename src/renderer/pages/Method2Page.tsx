import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  Bot,
  Calculator,
  CheckCircle2,
  CircleDollarSign,
  Factory,
  FileSpreadsheet,
  Gauge,
  Layers,
  Loader2,
  MessageCircle,
  Paintbrush,
  Route,
  Send,
  Sparkles,
  Zap,
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
import { cn } from '@/lib/utils'

type Message = { role: 'user' | 'assistant'; content: string }

type Method2Component = {
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

const kg = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
})

const currency = new Intl.NumberFormat('en-SG', {
  style: 'currency',
  currency: 'SGD',
  maximumFractionDigits: 2,
})

const demoPart = {
  partId: 'M2-DEMO-001',
  partName: 'Precision aluminium bracket',
  supplier: 'Singapore PE supplier',
  year: '2024',
  material: 'Aluminium 6061 block',
  weightKg: 12.5,
  rawMaterialCostSgd: 820,
  machiningCostSgd: 1450,
  surfaceTreatmentCostSgd: 360,
}

const method2Components: Method2Component[] = [
  {
    id: 'metal',
    label: 'Raw material',
    description: 'Upstream metal or metal block production before machining.',
    icon: Layers,
    source: 'USEEIO spend-based fallback',
    formula: '2022 USD raw material spend x NAICS emission factor',
    valueKg: 182.4,
    confidence: 'Fallback',
    rowClass: 'border-lime-400/20 bg-lime-400/[0.04]',
    barClass: 'bg-lime-400',
    textClass: 'text-lime-700',
    details: [
      { label: 'NAICS proxy', value: '331315 Aluminium sheet, plate, and foil' },
      { label: 'Cost basis', value: currency.format(demoPart.rawMaterialCostSgd) },
      { label: 'Reason', value: 'Supplier PCF/EPD not available yet' },
    ],
  },
  {
    id: 'transport',
    label: 'Transport',
    description: 'Raw material movement from supplier origin to manufacturer.',
    icon: Route,
    source: 'GLEC-style fixed demo factor',
    formula: 'Weight x distance x transport-mode factor',
    valueKg: 31.88,
    confidence: 'Estimated',
    rowClass: 'border-sky-400/20 bg-sky-400/[0.04]',
    barClass: 'bg-sky-400',
    textClass: 'text-sky-700',
    details: [
      { label: 'Origin', value: 'Malaysia to Singapore' },
      { label: 'Distance', value: '425 km' },
      { label: 'Mode', value: 'Road freight, assumed' },
    ],
  },
  {
    id: 'fabrication',
    label: 'Machining / fabrication',
    description: 'Company electricity allocated to the part through machining cost.',
    icon: Factory,
    source: 'Company-derived electricity approach',
    formula: 'Machine power x hours x grid EF, allocated to part',
    valueKg: 96.25,
    confidence: 'Primary',
    rowClass: 'border-teal-400/20 bg-teal-400/[0.04]',
    barClass: 'bg-teal-400',
    textClass: 'text-teal-700',
    details: [
      { label: 'Machine power', value: '7.5 kW' },
      { label: 'Operating time', value: '28 hours' },
      { label: 'Grid factor', value: '0.458 kg CO2e/kWh' },
    ],
  },
  {
    id: 'surface',
    label: 'Surface treatment',
    description: 'Anodizing, plating, heat treatment, polishing, or coating.',
    icon: Paintbrush,
    source: 'Method 1 fallback until supplier data is available',
    formula: '2022 USD surface treatment spend x NAICS factor',
    valueKg: 74.6,
    confidence: 'Fallback',
    rowClass: 'border-rose-400/20 bg-rose-400/[0.04]',
    barClass: 'bg-rose-400',
    textClass: 'text-rose-700',
    details: [
      { label: 'NAICS proxy', value: '332812 Metal coating and allied services' },
      { label: 'Cost basis', value: currency.format(demoPart.surfaceTreatmentCostSgd) },
      { label: 'Reason', value: 'Treatment vendor factor not available yet' },
    ],
  },
]

const method2Steps = [
  { id: 1, title: 'Part data', description: 'Fixed demo inputs' },
  { id: 2, title: 'Hybrid model', description: 'Physical + spend data' },
  { id: 3, title: 'Review', description: 'AI-assisted checks' },
] as const

const requiredDocuments = [
  'Supplier PCF, EPD, or raw material carbon factor',
  'Transport origin, distance, mode, and material weight',
  'Annual electricity use, machine hours, or machining cost pool',
  'Surface treatment supplier disclosure or process factor',
]

function StepIndicator() {
  return (
    <ol className="grid gap-2">
      {method2Steps.map((step) => (
        <li
          key={step.id}
          className={cn(
            'flex items-center gap-3 rounded-md border px-3 py-2.5 transition-colors',
            step.id === 2
              ? 'border-lime-300 bg-lime-300 text-zinc-950'
              : 'border-white/10 text-zinc-300',
          )}
        >
          <span
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-md text-sm font-semibold',
              step.id === 1 && 'bg-lime-300 text-zinc-950',
              step.id === 2 && 'bg-zinc-950 text-lime-300',
              step.id === 3 && 'bg-white/10 text-zinc-300',
            )}
          >
            {step.id === 1 ? <CheckCircle2 className="size-4" /> : step.id}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium">{step.title}</span>
            <span className={cn('block truncate text-xs', step.id === 2 ? 'text-zinc-700' : 'text-zinc-400')}>
              {step.description}
            </span>
          </span>
        </li>
      ))}
    </ol>
  )
}

function ComponentBreakdown() {
  const max = Math.max(...method2Components.map((item) => item.valueKg), 1)

  return (
    <div className="space-y-3">
      {method2Components.map((item) => {
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

function ResultsPanel() {
  const total = method2Components.reduce((sum, item) => sum + item.valueKg, 0)
  const primaryShare =
    (method2Components
      .filter((item) => item.confidence === 'Primary')
      .reduce((sum, item) => sum + item.valueKg, 0) /
      total) *
    100

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-lg border border-lime-300/30 bg-gradient-to-br from-lime-500/15 via-white/80 to-teal-500/10 p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-lime-700/80">Demo total emissions</p>
        <p className="mt-1 font-mono text-4xl font-semibold tracking-tight text-zinc-950 tabular-nums">
          {kg.format(total)}
          <span className="ml-2 text-lg font-normal text-lime-700/90">kg CO2e</span>
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-zinc-900/12 bg-zinc-950/5 px-2.5 py-1 font-mono text-lime-800">
            {demoPart.partId}
          </span>
          <span className="rounded-full border border-zinc-900/12 bg-zinc-950/5 px-2.5 py-1 text-muted-foreground">
            {demoPart.weightKg} kg material · {demoPart.year}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-zinc-900/12 bg-white/70 p-3">
          <p className="text-xs text-muted-foreground">Primary data share</p>
          <p className="mt-1 font-mono text-lg text-teal-700 tabular-nums">{primaryShare.toFixed(0)}%</p>
        </div>
        <div className="rounded-lg border border-zinc-900/12 bg-white/70 p-3">
          <p className="text-xs text-muted-foreground">Intensity</p>
          <p className="mt-1 font-mono text-lg text-lime-700 tabular-nums">
            {(total / demoPart.weightKg).toFixed(2)}
            <span className="text-xs font-sans text-muted-foreground"> kg/kg</span>
          </p>
        </div>
      </div>

      <div>
        <p className="mb-3 text-sm font-medium text-muted-foreground">Emissions by Method 2 component</p>
        <ComponentBreakdown />
      </div>

      <div className="space-y-2 border-t border-zinc-900/12 pt-4">
        <p className="text-sm font-medium text-muted-foreground">Data readiness</p>
        {method2Components.map((item) => {
          const Icon = item.icon
          return (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-zinc-900/12 bg-white/70 px-3 py-2.5 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Icon className={cn('size-4 shrink-0', item.textClass)} />
                <span className="truncate">{item.label}</span>
              </span>
              <span className={cn('shrink-0 font-mono text-xs tabular-nums', item.textClass)}>
                {item.confidence}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ProcessPanel() {
  return (
    <div className="space-y-4">
      {method2Components.map((item, index) => {
        const Icon = item.icon
        return (
          <div key={item.id} className={cn('rounded-lg border p-4', item.rowClass)}>
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-white/70">
                <Icon className={cn('size-5', item.textClass)} />
              </span>
              <div className="min-w-0">
                <p className={cn('font-medium', item.textClass)}>
                  Step {index + 1}: {item.label}
                </p>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">{item.formula}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-2 text-sm">
              {item.details.map((detail) => (
                <div
                  key={detail.label}
                  className="flex items-start justify-between gap-3 rounded-lg border border-zinc-900/12 bg-white/70 px-3 py-2"
                >
                  <span className="text-muted-foreground">{detail.label}</span>
                  <span className="max-w-[65%] text-right font-mono text-xs text-foreground">{detail.value}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function Method2Page() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const fixedContext = useMemo(() => {
    const total = method2Components.reduce((sum, item) => sum + item.valueKg, 0)
    const lines = method2Components.map(
      (item) =>
        `${item.label}: ${item.valueKg} kg CO2e (${item.confidence}; ${item.source}; ${item.formula})`,
    )
    return [
      `Method 2 fixed demo part: ${demoPart.partName} (${demoPart.partId})`,
      `Supplier: ${demoPart.supplier}`,
      `Material: ${demoPart.material}, weight ${demoPart.weightKg} kg`,
      `Total demo emissions: ${total.toFixed(2)} kg CO2e`,
      ...lines,
      `Missing source documents: ${requiredDocuments.join('; ')}`,
    ].join('\n')
  }, [])

  async function sendMessage(e?: React.FormEvent) {
    if (e) e.preventDefault()
    const message = input.trim()
    if (!message) return

    const userMsg: Message = { role: 'user', content: message }
    setMessages((m) => [...m, userMsg])
    setInput('')
    setLoading(true)

    try {
      const formData = new FormData()
      formData.append('message', `${fixedContext}\n\nUser question: ${message}`)

      const res = await fetch('http://127.0.0.1:8000/method2-chat', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const errorDetail =
          data && typeof data === 'object' && 'detail' in data
            ? String((data as { detail: unknown }).detail)
            : res.statusText
        throw new Error(errorDetail || 'Unknown API error')
      }

      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: typeof data.reply === 'string' ? data.reply : 'No reply returned from the server.',
        },
      ])
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: `Error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppBackground>
      <section className="relative z-10 mx-auto grid w-full max-w-[92rem] gap-4 pb-8 lg:grid-cols-[12rem_minmax(0,1fr)]">
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
              <MessageCircle className="size-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-lime-300">Activity data</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight">Method 2</h1>
            </div>
            <p className="text-sm leading-6 text-zinc-300">
              Hybrid emissions estimate using fixed placeholder data until supplier documents and activity inputs are available.
            </p>

            <div className="mt-8 border-t border-white/10 pt-5">
              <StepIndicator />
            </div>
          </div>
        </aside>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,34rem)]">
          <main className="space-y-4">
            <div className="rounded-lg border border-zinc-900/12 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Method 2 workspace</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">Company-derived hybrid method</h2>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-md bg-zinc-950 px-4 py-3 text-white">
                    <p className="text-xs text-zinc-400">Part</p>
                    <p className="mt-1 max-w-[12rem] truncate font-mono text-lg">{demoPart.partId}</p>
                  </div>
                  <div className="rounded-md bg-lime-200 px-4 py-3 text-lime-950">
                    <p className="text-xs text-lime-950/70">Mode</p>
                    <p className="mt-1 font-mono text-lg">Demo</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.05fr)_minmax(21rem,0.95fr)]">
              <div className="space-y-4">
                <Card className="gap-0 overflow-hidden border-zinc-900/12 bg-white py-0 shadow-sm">
                  <CardHeader className="border-b border-zinc-900/10 bg-zinc-950 px-5 py-4 text-white">
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 items-center justify-center rounded-md bg-lime-300 text-zinc-950">
                        <FileSpreadsheet className="size-5" />
                      </span>
                      <div>
                        <CardTitle>Part activity inputs</CardTitle>
                        <CardDescription className="text-zinc-300">Hard-coded values for the Method 2 prototype.</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5 px-5 py-6">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {[
                        ['Part name', demoPart.partName],
                        ['Supplier', demoPart.supplier],
                        ['Material', demoPart.material],
                        ['Material weight', `${demoPart.weightKg} kg`],
                        ['Raw material cost', currency.format(demoPart.rawMaterialCostSgd)],
                        ['Machining cost', currency.format(demoPart.machiningCostSgd)],
                        ['Surface treatment cost', currency.format(demoPart.surfaceTreatmentCostSgd)],
                        ['Assessment year', demoPart.year],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-lg border border-zinc-900/12 bg-white/70 p-3">
                          <p className="text-xs text-muted-foreground">{label}</p>
                          <p className="mt-1 truncate font-mono text-sm text-foreground">{value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-lg border border-amber-400/25 bg-amber-50 p-4">
                      <div className="flex items-start gap-3">
                        <Sparkles className="mt-0.5 size-5 shrink-0 text-amber-700" />
                        <div>
                          <p className="font-medium text-amber-950">Temporary data model</p>
                          <p className="mt-1 text-sm leading-6 text-amber-900/80">
                            These values mirror the slide methodology and can be replaced later with parsed supplier files,
                            transport tools, electricity records, and treatment vendor disclosures.
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="gap-0 overflow-hidden border-zinc-900/12 bg-white py-0 shadow-sm">
                  <CardHeader className="border-b border-zinc-900/10 bg-[#faf8f1] px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 items-center justify-center rounded-md bg-lime-300/80 text-zinc-950">
                        <Gauge className="size-5" />
                      </span>
                      <div>
                        <CardTitle>Method 2 components</CardTitle>
                        <CardDescription>Raw material, transport, fabrication, and surface treatment.</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 px-5 py-6">
                    {method2Components.map((item) => {
                      const Icon = item.icon
                      return (
                        <div key={item.id} className={cn('rounded-lg border p-4', item.rowClass)}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-3">
                              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-white/70">
                                <Icon className={cn('size-5', item.textClass)} />
                              </span>
                              <div className="min-w-0">
                                <p className="font-medium text-foreground">{item.label}</p>
                                <p className="mt-1 text-sm leading-5 text-muted-foreground">{item.description}</p>
                              </div>
                            </div>
                            <span className={cn('shrink-0 font-mono text-sm tabular-nums', item.textClass)}>
                              {kg.format(item.valueKg)} kg
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs">
                            <span className="rounded-full border border-zinc-900/12 bg-white/70 px-2.5 py-1 text-muted-foreground">
                              {item.source}
                            </span>
                            <span className={cn('rounded-full border border-zinc-900/12 bg-white/70 px-2.5 py-1 font-mono', item.textClass)}>
                              {item.confidence}
                            </span>
                          </div>
                        </div>
                      )
                    })}
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
                        <CardDescription className="text-zinc-300">Static output from the demo calculation.</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="px-5 py-6">
                    <ResultsPanel />
                  </CardContent>
                </Card>

                <Card className="gap-0 overflow-hidden border-zinc-900/12 bg-white py-0 shadow-sm">
                  <CardHeader className="border-b border-zinc-900/10 bg-[#faf8f1] px-5 py-4">
                    <CardTitle>Calculation Process</CardTitle>
                    <CardDescription>Step-by-step breakdown based on the Method 2 slides.</CardDescription>
                  </CardHeader>
                  <CardContent className="px-5 py-6">
                    <ProcessPanel />
                  </CardContent>
                </Card>

                <Card className="gap-0 overflow-hidden border-zinc-900/12 bg-white py-0 shadow-sm">
                  <CardHeader className="border-b border-zinc-900/10 bg-[#faf8f1] px-5 py-4">
                    <CardTitle>Documents Needed Later</CardTitle>
                    <CardDescription>Inputs to replace the hard-coded prototype values.</CardDescription>
                  </CardHeader>
                  <CardContent className="px-5 py-6">
                    <div className="space-y-2">
                      {requiredDocuments.map((doc) => (
                        <div key={doc} className="flex gap-2 rounded-lg border border-zinc-900/12 bg-white/70 px-3 py-2 text-sm">
                          <CircleDollarSign className="mt-0.5 size-4 shrink-0 text-lime-700" />
                          <span className="text-muted-foreground">{doc}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </aside>
            </div>
          </main>

          <aside className="xl:sticky xl:top-4 xl:self-start">
            <Card className="gap-0 overflow-hidden border-zinc-900/12 bg-white py-0 shadow-sm xl:h-[calc(100vh-4rem)] xl:min-h-[42rem] xl:max-h-[54rem]">
              <CardHeader className="border-b border-zinc-900/10 bg-zinc-950 px-5 py-4 text-white">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-md bg-lime-300 text-zinc-950">
                    <Bot className="size-5" />
                  </span>
                  <div>
                    <CardTitle>AI Assistant</CardTitle>
                    <CardDescription className="text-zinc-300">Contextual help for the Method 2 demo data.</CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="flex min-h-[36rem] flex-1 flex-col p-0 xl:min-h-0">
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
                  {messages.length === 0 ? (
                    <div className="mx-auto mt-10 max-w-sm rounded-lg border border-dashed border-lime-300/35 bg-lime-300/[0.03] p-5 text-center text-sm leading-6 text-muted-foreground">
                      Ask the assistant to explain the hard-coded Method 2 calculation or identify missing source documents.
                    </div>
                  ) : (
                    messages.map((m, i) => (
                      <div
                        key={i}
                        className={`max-w-[88%] rounded-lg px-3 py-2 ${
                          m.role === 'user'
                            ? 'ml-auto bg-lime-100 text-zinc-950'
                            : 'mr-auto bg-zinc-950 text-white'
                        }`}
                      >
                        <div className="whitespace-pre-wrap text-sm leading-6">{m.content}</div>
                      </div>
                    ))
                  )}
                  {loading ? (
                    <div className="mr-auto inline-flex items-center gap-2 rounded-lg bg-zinc-950 px-3 py-2 text-sm text-white">
                      <Loader2 className="size-4 animate-spin" />
                      Thinking
                    </div>
                  ) : null}
                </div>

                <form onSubmit={sendMessage} className="border-t border-zinc-900/10 bg-[#faf8f1] p-4">
                  <div className="flex gap-2">
                    <Input
                      className="h-12"
                      placeholder="Ask about Method 2..."
                      value={input}
                      onChange={(e) => setInput((e.target as HTMLInputElement).value)}
                      disabled={loading}
                    />
                    <Button type="submit" size="icon" disabled={loading}>
                      {loading ? <Loader2 className="animate-spin" /> : <Send />}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </aside>
        </div>
      </section>
    </AppBackground>
  )
}
