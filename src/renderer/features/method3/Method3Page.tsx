import {
  AlertCircle,
  ArrowLeft,
  Calculator,
  CheckCircle2,
  ChevronDown,
  Database,
  Loader2,
  ReceiptText,
  Search,
} from 'lucide-react'
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { AppBackground } from '@/components/AppBackground'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
  calculateMethod3,
  fetchMethod3Basis,
  fetchMethod3ReferenceData,
  type Method3CalculateResponse,
  type Method3CalculationBasis,
  type Method3ReferenceDataResponse,
} from '@/lib/calculator-api'
import { useCalculationHistorySave } from '@/features/calculation-history/useCalculationHistorySave'
import { cn } from '@/lib/utils'

interface Method3PageProps {
  onHistorySaved?: () => void
}

interface SearchOption {
  code: string
  label: string
}

const sgd = new Intl.NumberFormat('en-SG', {
  style: 'currency',
  currency: 'SGD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const number = new Intl.NumberFormat('en-SG', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const factorNumber = new Intl.NumberFormat('en-SG', {
  minimumFractionDigits: 3,
  maximumFractionDigits: 6,
})

const MONTH_OPTIONS = [
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
] as const

function SearchableReferenceField({
  id,
  label,
  placeholder,
  options,
  value,
  onChange,
  disabled,
}: {
  id: string
  label: string
  placeholder: string
  options: SearchOption[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
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
  const selected = useMemo(
    () => options.find((option) => option.code === value),
    [options, value],
  )
  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return options
    return options.filter((option) =>
      `${option.code} ${option.label}`.toLocaleLowerCase().includes(normalized),
    )
  }, [options, query])

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

  const inputValue = open ? query : selected ? `${selected.code} | ${selected.label}` : ''

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label} <span className="text-red-600">*</span></Label>
      <div className="relative">
        <Search className="pointer-events-none absolute top-3 left-3 size-4 text-zinc-400" />
        <Input
          ref={inputRef}
          id={id}
          className="pr-9 pl-9"
          placeholder={placeholder}
          value={inputValue}
          disabled={disabled}
          autoComplete="off"
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
        />
        <ChevronDown className="pointer-events-none absolute top-3 right-3 size-4 text-zinc-400" />
        {open && menuRect
          ? createPortal(
              <div
                className="fixed z-[1000] overflow-y-auto rounded-lg border border-zinc-900/15 bg-white p-1 text-zinc-950 shadow-xl"
                style={{
                  left: menuRect.left,
                  top: menuRect.top,
                  width: menuRect.width,
                  maxHeight: menuRect.maxHeight,
                }}
              >
                {filteredOptions.length ? filteredOptions.map((option) => (
                  <button
                    key={option.code}
                    type="button"
                    className={cn(
                      'flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm outline-none hover:bg-lime-100 focus:bg-lime-100',
                      option.code === value && 'bg-lime-50',
                    )}
                    onMouseDown={(event) => {
                      event.preventDefault()
                      onChange(option.code)
                      setQuery('')
                      setOpen(false)
                    }}
                  >
                    <span className="shrink-0 font-mono font-semibold">{option.code}</span>
                    <span className="min-w-0 text-zinc-600">{option.label}</span>
                  </button>
                )) : (
                  <p className="px-2 py-3 text-sm text-zinc-500">No matching option</p>
                )}
              </div>,
              document.body,
            )
          : null}
      </div>
    </div>
  )
}

function BasisMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-zinc-900/8 pb-3 last:border-0 last:pb-0">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-medium leading-5 text-zinc-950">{value}</p>
    </div>
  )
}

function CalculationBasisPanel({
  basis,
  loading,
  error,
  dataset,
}: {
  basis: Method3CalculationBasis | null
  loading: boolean
  error: string | null
  dataset: Method3ReferenceDataResponse['dataset'] | null
}) {
  if (loading) {
    return (
      <div className="flex min-h-80 items-center justify-center gap-3 text-sm text-zinc-500">
        <Loader2 className="size-5 animate-spin text-lime-700" /> Loading calculation basis…
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 p-4" role="alert">
        <AlertCircle className="mt-0.5 size-5 shrink-0 text-red-600" />
        <p className="text-sm leading-6 text-red-800">{error}</p>
      </div>
    )
  }
  if (!basis) {
    return (
      <div className="flex min-h-80 flex-col items-center justify-center rounded-lg border border-dashed border-zinc-900/15 bg-zinc-50 p-8 text-center">
        <Database className="size-8 text-zinc-400" />
        <p className="mt-3 font-medium text-zinc-800">Select the purchase classification</p>
        <p className="mt-1 max-w-sm text-sm leading-6 text-zinc-500">
          The factor, monthly price index and 2025 annual-average reference index will appear here.
        </p>
        {dataset ? (
          <p className="mt-4 rounded-full bg-lime-100 px-3 py-1 text-xs font-medium text-lime-800">
            {dataset.version} · {dataset.currency} · Purchaser price
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
      <BasisMetric label="Active Dataset" value={basis.dataset_version} />
      <BasisMetric label="Country of Origin" value={basis.country_name} />
      <div className="sm:col-span-2 lg:col-span-1 xl:col-span-2">
        <BasisMetric label="CEDA Sector" value={`${basis.sector_code} - ${basis.sector_name}`} />
      </div>
      <BasisMetric label="Purchase Type" value={basis.purchase_type_label} />
      <BasisMetric label="Price Index Used" value={basis.price_index_label} />
      <BasisMetric label="Purchase Period Index" value={`${basis.purchase_period}: ${factorNumber.format(basis.purchase_index)}`} />
      <BasisMetric label="Reference Price Year" value={`${basis.reference_price_year} annual average`} />
      <BasisMetric label="Reference Index" value={factorNumber.format(basis.reference_index)} />
      <BasisMetric label="Index Base Year" value={`${basis.index_base_year} = 100`} />
      <BasisMetric label="Price Basis" value="Purchaser Price" />
      <BasisMetric label="Currency" value={basis.currency} />
      <div className="sm:col-span-2 lg:col-span-1 xl:col-span-2 rounded-lg border border-lime-300/30 bg-lime-50 p-4">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-lime-700">CEDA Emission Factor</p>
        <p className="mt-1 font-mono text-xl font-semibold text-lime-900">
          {factorNumber.format(basis.emission_factor)} <span className="text-sm font-normal">kgCO₂e/SGD</span>
        </p>
      </div>
    </div>
  )
}

function ResultsPanel({ result }: { result: Method3CalculateResponse }) {
  const [open, setOpen] = useState(false)
  const basis = result.basis
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b border-zinc-900/10 bg-zinc-950 px-5 py-5 text-white">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-lime-300">Calculation Result</p>
        <CardTitle className="mt-1 text-2xl">{result.invoice_id}</CardTitle>
        <CardDescription className="text-zinc-300">{result.purchase_description}</CardDescription>
      </CardHeader>
      <CardContent className="px-5 py-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-zinc-900/10 bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">Original Spend</p>
            <p className="mt-1 font-mono text-lg font-semibold">{sgd.format(result.original_spend_sgd)}</p>
          </div>
          <div className="rounded-lg border border-teal-200 bg-teal-50 p-4">
            <p className="text-xs text-teal-700">Normalised Spend</p>
            <p className="mt-1 font-mono text-lg font-semibold text-teal-950">{sgd.format(result.normalized_spend_sgd)}</p>
            <p className="mt-1 text-[0.68rem] text-teal-700">Expressed in 2025 SGD purchaser price</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs text-amber-700">Price Adjustment</p>
            <p className="mt-1 font-mono text-lg font-semibold text-amber-950">
              {result.adjustment_percent >= 0 ? '+' : ''}{number.format(result.adjustment_percent)}%
            </p>
            <p className="mt-1 text-[0.68rem] text-amber-700">Factor {result.adjustment_factor.toFixed(4)}</p>
          </div>
          <div className="rounded-lg border border-lime-300/40 bg-lime-100 p-4">
            <p className="text-xs text-lime-800">Estimated Emissions</p>
            <p className="mt-1 font-mono text-xl font-semibold text-lime-950">{number.format(result.estimated_emissions_kgco2e)} kgCO₂e</p>
            <p className="mt-1 font-mono text-sm text-lime-800">{number.format(result.estimated_emissions_tco2e)} tCO₂e</p>
          </div>
        </div>

        <Button
          className="mt-5 w-full justify-between"
          variant="outline"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          View Calculation Details
          <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </Button>
        {open ? (
          <div className="mt-4 space-y-4 rounded-lg border border-zinc-900/10 bg-zinc-50 p-4 text-sm leading-6">
            <div><strong>1. Invoice Amount</strong><br />{sgd.format(result.original_spend_sgd)}</div>
            <div><strong>2. Purchase Classification</strong><br />{basis.purchase_type_label} · {basis.country_name} · {basis.sector_code}</div>
            <div><strong>3. Price Index Selection</strong><br />{basis.price_index_label}</div>
            <div>
              <strong>4. Price-Year Normalisation</strong><br />
              Purchase index: {basis.purchase_period} = {factorNumber.format(basis.purchase_index)}<br />
              Reference index: {basis.reference_price_year} annual average = {factorNumber.format(basis.reference_index)}<br />
              <span className="font-mono">{sgd.format(result.original_spend_sgd)} × {factorNumber.format(basis.reference_index)} ÷ {factorNumber.format(basis.purchase_index)} = {sgd.format(result.normalized_spend_sgd)}</span>
            </div>
            <div>
              <strong>5. Open CEDA Factor</strong><br />
              {basis.dataset_version} · {basis.country_name} × {basis.sector_code} · Purchaser Price<br />
              {factorNumber.format(basis.emission_factor)} kgCO₂e/SGD
            </div>
            <div className="rounded-md bg-lime-100 p-3 text-lime-950">
              <strong>6. Estimated Emissions</strong><br />
              <span className="font-mono">{sgd.format(result.normalized_spend_sgd)} × {factorNumber.format(basis.emission_factor)} = {number.format(result.estimated_emissions_kgco2e)} kgCO₂e = {number.format(result.estimated_emissions_tco2e)} tCO₂e</span>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default function Method3Page({ onHistorySaved }: Method3PageProps) {
  const [referenceData, setReferenceData] = useState<Method3ReferenceDataResponse | null>(null)
  const [referenceError, setReferenceError] = useState<string | null>(null)
  const [referenceLoading, setReferenceLoading] = useState(true)
  const [basis, setBasis] = useState<Method3CalculationBasis | null>(null)
  const [basisError, setBasisError] = useState<string | null>(null)
  const [basisLoading, setBasisLoading] = useState(false)
  const [result, setResult] = useState<Method3CalculateResponse | null>(null)
  const [calculationError, setCalculationError] = useState<string | null>(null)
  const [calculating, setCalculating] = useState(false)
  const [form, setForm] = useState({
    invoiceId: '',
    purchaseDescription: '',
    purchaseYear: '',
    purchaseMonth: '',
    invoiceAmount: '',
    purchaseType: '',
    countryCode: '',
    sectorCode: '',
  })
  const basisRequestId = useRef(0)
  const { historyWarning, clearHistoryWarning, saveCalculationHistory } = useCalculationHistorySave(onHistorySaved)

  useEffect(() => {
    let active = true
    setReferenceLoading(true)
    fetchMethod3ReferenceData()
      .then((data) => {
        if (!active) return
        setReferenceData(data)
        setReferenceError(null)
      })
      .catch((error) => {
        if (!active) return
        setReferenceError(error instanceof Error ? error.message : 'Method 3 reference data could not be loaded.')
      })
      .finally(() => active && setReferenceLoading(false))
    return () => { active = false }
  }, [])

  const purchaseYear = Number(form.purchaseYear)
  const purchaseMonth = Number(form.purchaseMonth)
  const currentDate = new Date()
  const currentYear = currentDate.getFullYear()
  const currentMonth = currentDate.getMonth() + 1
  const yearOptions = useMemo(
    () => Array.from({ length: currentYear - 1974 + 1 }, (_, index) => currentYear - index),
    [currentYear],
  )
  useEffect(() => {
    if (!purchaseYear || !purchaseMonth || !form.purchaseType || !form.countryCode || !form.sectorCode) {
      setBasis(null)
      setBasisError(null)
      return
    }
    const requestId = ++basisRequestId.current
    const timer = window.setTimeout(() => {
      setBasisLoading(true)
      setBasisError(null)
      fetchMethod3Basis({
        purchase_year: purchaseYear,
        purchase_month: purchaseMonth,
        purchase_type: form.purchaseType as 'imported_raw_material' | 'local_processing' | 'overseas_processing',
        country_code: form.countryCode,
        sector_code: form.sectorCode,
      })
        .then((data) => {
          if (requestId === basisRequestId.current) setBasis(data)
        })
        .catch((error) => {
          if (requestId !== basisRequestId.current) return
          setBasis(null)
          setBasisError(error instanceof Error ? error.message : 'Calculation basis could not be loaded.')
        })
        .finally(() => {
          if (requestId === basisRequestId.current) setBasisLoading(false)
        })
    }, 250)
    return () => window.clearTimeout(timer)
  }, [form.countryCode, form.purchaseType, form.sectorCode, purchaseMonth, purchaseYear])

  const countryOptions = useMemo(
    () => referenceData?.countries.map((item) => ({ code: item.code, label: item.name })) ?? [],
    [referenceData],
  )
  const sectorOptions = useMemo(
    () => referenceData?.sectors.map((item) => ({ code: item.code, label: item.name })) ?? [],
    [referenceData],
  )

  async function submit(event: FormEvent) {
    event.preventDefault()
    clearHistoryWarning()
    setCalculationError(null)
    setResult(null)
    if (!form.invoiceId || !form.purchaseDescription || !purchaseYear || !purchaseMonth || !form.invoiceAmount || !form.purchaseType || !form.countryCode || !form.sectorCode) {
      setCalculationError('Please complete all required fields before calculating.')
      return
    }
    const amount = Number(form.invoiceAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setCalculationError('Invoice amount must be greater than zero.')
      return
    }
    setCalculating(true)
    try {
      const request = {
        invoice_id: form.invoiceId.trim(),
        purchase_description: form.purchaseDescription.trim(),
        purchase_year: purchaseYear,
        purchase_month: purchaseMonth,
        invoice_amount_sgd: amount,
        purchase_type: form.purchaseType as 'imported_raw_material' | 'local_processing' | 'overseas_processing',
        country_code: form.countryCode,
        sector_code: form.sectorCode,
      }
      const calculated = await calculateMethod3(request)
      setResult(calculated)
      setBasis(calculated.basis)
      await saveCalculationHistory({ method: 'method3', request, result: calculated })
    } catch (error) {
      setCalculationError(error instanceof Error ? error.message : 'Method 3 calculation failed.')
    } finally {
      setCalculating(false)
    }
  }

  return (
    <AppBackground>
      <main className="relative z-10 mx-auto w-full max-w-7xl space-y-4">
        <header className="rounded-lg border border-zinc-900/12 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <a href="#" className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-950">
                <ArrowLeft className="size-4" /> Back to workflows
              </a>
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-lime-700">Scope 3 · Purchased Goods and Services</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">Method 3: Open CEDA Spend-Based Calculation</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
                Estimate emissions using invoice expenditure and country-specific Open CEDA emission factors.
              </p>
            </div>
            {referenceData ? (
              <div className="grid grid-cols-2 gap-x-5 gap-y-2 rounded-lg border border-zinc-900/10 bg-zinc-50 px-4 py-3 text-xs">
                <span className="text-zinc-500">Dataset</span><strong>{referenceData.dataset.version}</strong>
                <span className="text-zinc-500">Reference</span><strong>{referenceData.dataset.reference_price_year} average</strong>
                <span className="text-zinc-500">Currency</span><strong>SGD</strong>
                <span className="text-zinc-500">Basis</span><strong>Purchaser Price</strong>
              </div>
            ) : null}
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-5 text-amber-900">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            All expenditure is normalised to the active Open CEDA reference price year using the 12-month annual-average index before applying the emission factor.
          </div>
        </header>

        {referenceError ? (
          <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 p-4" role="alert">
            <AlertCircle className="mt-0.5 size-5 text-red-600" />
            <div><p className="font-medium text-red-900">Method 3 data is not ready</p><p className="mt-1 text-sm text-red-700">{referenceError}</p></div>
          </div>
        ) : null}

        <form onSubmit={submit} className="space-y-4">
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1.12fr)_minmax(20rem,0.88fr)]">
            <Card className="gap-0 overflow-hidden py-0">
              <CardHeader className="border-b border-zinc-900/10 bg-[#faf8f1] px-5 py-4">
                <div className="flex items-center gap-3"><ReceiptText className="size-5 text-lime-700" /><div><CardTitle>User Input</CardTitle><CardDescription>Invoice information and purchase classification.</CardDescription></div></div>
              </CardHeader>
              <CardContent className="space-y-7 px-5 py-6">
                <fieldset className="space-y-4" disabled={referenceLoading || Boolean(referenceError)}>
                  <legend className="mb-4 text-sm font-semibold uppercase tracking-[0.1em] text-zinc-500">A. Invoice Information</legend>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2"><Label htmlFor="method3-invoice">Invoice ID <span className="text-red-600">*</span></Label><Input id="method3-invoice" placeholder="INV-2026-001" value={form.invoiceId} onChange={(event) => setForm({ ...form, invoiceId: event.target.value })} /></div>
                    <div className="space-y-2">
                      <Label>Purchase Month and Year <span className="text-red-600">*</span></Label>
                      <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-2">
                        <Select
                          value={form.purchaseMonth}
                          onValueChange={(purchaseMonthValue) => setForm({ ...form, purchaseMonth: purchaseMonthValue })}
                        >
                          <SelectTrigger aria-label="Purchase month"><SelectValue placeholder="Month" /></SelectTrigger>
                          <SelectContent>
                            {MONTH_OPTIONS.map((month) => (
                              <SelectItem
                                key={month.value}
                                value={month.value}
                                disabled={purchaseYear === currentYear && Number(month.value) > currentMonth}
                              >
                                {month.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={form.purchaseYear}
                          onValueChange={(purchaseYearValue) => {
                            const nextYear = Number(purchaseYearValue)
                            const nextMonth = Number(form.purchaseMonth)
                            setForm({
                              ...form,
                              purchaseYear: purchaseYearValue,
                              purchaseMonth: nextYear === currentYear && nextMonth > currentMonth ? '' : form.purchaseMonth,
                            })
                          }}
                        >
                          <SelectTrigger aria-label="Purchase year"><SelectValue placeholder="Year" /></SelectTrigger>
                          <SelectContent>
                            {yearOptions.map((year) => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2"><Label htmlFor="method3-description">Purchase Description <span className="text-red-600">*</span></Label><Input id="method3-description" placeholder="Imported aluminium block" value={form.purchaseDescription} onChange={(event) => setForm({ ...form, purchaseDescription: event.target.value })} /></div>
                  <div className="space-y-2"><Label htmlFor="method3-amount">Invoice Amount (SGD) <span className="text-red-600">*</span></Label><div className="flex"><span className="flex h-10 items-center rounded-l-lg border border-r-0 border-zinc-900/15 bg-zinc-100 px-3 text-sm font-semibold">SGD</span><Input id="method3-amount" className="rounded-l-none" type="number" min="0.01" step="0.01" placeholder="20,000.00" value={form.invoiceAmount} onChange={(event) => setForm({ ...form, invoiceAmount: event.target.value })} /></div></div>
                </fieldset>

                <fieldset className="space-y-4 border-t border-zinc-900/10 pt-6" disabled={referenceLoading || Boolean(referenceError)}>
                  <legend className="mb-4 text-sm font-semibold uppercase tracking-[0.1em] text-zinc-500">B. Purchase Classification</legend>
                  <div className="space-y-2">
                    <Label>Purchase Type <span className="text-red-600">*</span></Label>
                    <Select value={form.purchaseType} onValueChange={(value) => setForm({ ...form, purchaseType: value })}>
                      <SelectTrigger><SelectValue placeholder="Select purchase type" /></SelectTrigger>
                      <SelectContent>{referenceData?.purchase_types.map((item) => <SelectItem key={item.code} value={item.code}>{item.label}</SelectItem>)}</SelectContent>
                    </Select>
                    {form.purchaseType ? <p className="text-xs text-zinc-500">System-selected index: {referenceData?.purchase_types.find((item) => item.code === form.purchaseType)?.price_index_label}</p> : null}
                  </div>
                  <SearchableReferenceField id="method3-country" label="Country of Origin" placeholder="Search country or ISO code" options={countryOptions} value={form.countryCode} onChange={(countryCode) => setForm({ ...form, countryCode })} />
                  <SearchableReferenceField id="method3-sector" label="CEDA / NAICS Sector" placeholder="Search sector code or description" options={sectorOptions} value={form.sectorCode} onChange={(sectorCode) => setForm({ ...form, sectorCode })} />
                </fieldset>

                {calculationError ? <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert"><AlertCircle className="mt-0.5 size-4 shrink-0" />{calculationError}</div> : null}
                {historyWarning ? <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><AlertCircle className="mt-0.5 size-4 shrink-0" />{historyWarning}</div> : null}
                <Button type="submit" size="lg" className="w-full" disabled={calculating || referenceLoading || Boolean(referenceError)}>{calculating ? <Loader2 className="animate-spin" /> : <Calculator />}{calculating ? 'Calculating…' : 'Calculate Emissions'}</Button>
              </CardContent>
            </Card>

            <Card className="gap-0 overflow-hidden py-0">
              <CardHeader className="border-b border-zinc-900/10 bg-[#faf8f1] px-5 py-4"><div className="flex items-center gap-3"><Database className="size-5 text-teal-700" /><div><CardTitle>Calculation Basis</CardTitle><CardDescription>Read-only factors and price normalisation settings.</CardDescription></div></div></CardHeader>
              <CardContent className="px-5 py-6"><CalculationBasisPanel basis={basis} loading={basisLoading} error={basisError} dataset={referenceData?.dataset ?? null} /></CardContent>
            </Card>
          </section>
          {result ? <ResultsPanel result={result} /> : null}
        </form>
        <p className="pb-4 text-center text-xs text-zinc-500">Open CEDA attribution: {referenceData?.dataset.attribution ?? 'CEDA by Watershed'}</p>
      </main>
    </AppBackground>
  )
}
