import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  Clock3,
  Factory,
  FileSpreadsheet,
  History,
  Loader2,
  RefreshCw,
  SearchX,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { CalculationHistoryDetails } from './CalculationHistoryDetails'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type {
  CalculationHistoryDetail,
  CalculationHistoryMethod,
  CalculationHistorySummary,
} from '../../../shared/calculation-history-types'

const PAGE_SIZE = 12

const kg = new Intl.NumberFormat('en-SG', {
  maximumFractionDigits: 2,
})

const sgd = new Intl.NumberFormat('en-SG', {
  style: 'currency',
  currency: 'SGD',
  maximumFractionDigits: 2,
})

const compactDate = new Intl.DateTimeFormat('en-SG', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const detailedDate = new Intl.DateTimeFormat('en-SG', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

type HistoryFilter = 'all' | CalculationHistoryMethod

export interface CalculationHistorySidebarProps {
  refreshToken?: string | number
  onOpenChange?: (open: boolean) => void
}

const filters: Array<{ id: HistoryFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'useeio', label: 'USEEIO' },
  { id: 'method2', label: 'Method 2' },
]

function parseDate(value: string): Date | null {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatDate(value: string, detailed = false): string {
  const parsed = parseDate(value)
  if (!parsed) return 'Date unavailable'
  return (detailed ? detailedDate : compactDate).format(parsed)
}

function getMethodLabel(method: CalculationHistoryMethod): string {
  return method === 'useeio' ? 'USEEIO' : 'Method 2'
}

function MethodMark({ method }: { method: CalculationHistoryMethod }) {
  const Icon = method === 'useeio' ? FileSpreadsheet : Factory

  return (
    <span
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-md border',
        method === 'useeio'
          ? 'border-lime-500/20 bg-lime-100 text-lime-800'
          : 'border-teal-500/20 bg-teal-100 text-teal-800',
      )}
    >
      <Icon className="size-4" />
    </span>
  )
}

function TimelineSkeleton() {
  return (
    <div aria-label="Loading calculation history" className="space-y-4" role="status">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="relative pl-7">
          <span className="absolute top-5 left-[0.22rem] size-2.5 rounded-full bg-zinc-200" />
          <Card className="gap-0 py-0 shadow-none">
            <CardContent className="animate-pulse space-y-3 px-4 py-4 motion-reduce:animate-none">
              <div className="h-3 w-20 rounded bg-zinc-200" />
              <div className="h-5 w-2/3 rounded bg-zinc-200" />
              <div className="h-4 w-full rounded bg-zinc-100" />
            </CardContent>
          </Card>
        </div>
      ))}
      <span className="sr-only">Loading saved calculations</span>
    </div>
  )
}

function TimelineItem({
  item,
  onSelect,
}: {
  item: CalculationHistorySummary
  onSelect: (item: CalculationHistorySummary) => void
}) {
  return (
    <li className="group relative pl-7">
      <span
        aria-hidden="true"
        className={cn(
          'absolute top-6 left-0 z-10 size-4 rounded-full border-[3px] border-white ring-1 ring-zinc-900/15 transition-colors',
          item.method === 'useeio' ? 'bg-lime-500 group-hover:bg-lime-600' : 'bg-teal-500 group-hover:bg-teal-600',
        )}
      />
      <Button
        aria-label={`Open ${getMethodLabel(item.method)} calculation ${item.documentId}`}
        className="block h-auto w-full whitespace-normal p-0 text-left hover:bg-transparent"
        onClick={() => onSelect(item)}
        variant="ghost"
      >
        <Card className="gap-0 py-0 shadow-none transition-all group-hover:-translate-y-0.5 group-hover:border-zinc-900/30 group-hover:shadow-[0_12px_28px_rgba(24,39,24,0.08)] motion-reduce:transform-none">
          <CardContent className="px-4 py-4">
            <div className="flex items-start gap-3">
              <MethodMark method={item.method} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.1em]',
                      item.method === 'useeio'
                        ? 'bg-lime-100 text-lime-800'
                        : 'bg-teal-100 text-teal-800',
                    )}
                  >
                    {getMethodLabel(item.method)}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-xs font-normal text-zinc-500">
                    <CalendarDays className="size-3" /> {formatDate(item.createdAt)}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="truncate text-base font-semibold tracking-tight text-zinc-950">
                    {item.documentId}
                  </p>
                  <ChevronRight className="size-4 shrink-0 text-zinc-400 transition-transform group-hover:translate-x-0.5" />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-zinc-900/8 pt-3">
                  <div>
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-zinc-400">Emissions</p>
                    <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-zinc-900">
                      {kg.format(item.totalEmissionsKgCo2e)} kg
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-zinc-400">Year / spend</p>
                    <p className="mt-0.5 truncate font-mono text-sm tabular-nums text-zinc-600">
                      {item.year} · {sgd.format(item.totalAmountSgd)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </Button>
    </li>
  )
}

function EmptyState({ filter }: { filter: HistoryFilter }) {
  const isFiltered = filter !== 'all'

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-lg border border-zinc-900/10 bg-zinc-100 text-zinc-500">
        <SearchX className="size-5" />
      </span>
      <h3 className="mt-4 text-base font-semibold text-zinc-950">
        {isFiltered ? `No ${getMethodLabel(filter)} calculations` : 'No saved calculations yet'}
      </h3>
      <p className="mt-2 text-sm leading-6 text-zinc-500">
        {isFiltered
          ? 'Choose another filter or complete a new calculation using this method.'
          : 'Complete a USEEIO or Method 2 calculation and its saved snapshot will appear here.'}
      </p>
    </div>
  )
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center px-6 py-14 text-center" role="alert">
      <span className="flex size-12 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600">
        <AlertCircle className="size-5" />
      </span>
      <h3 className="mt-4 text-base font-semibold text-zinc-950">History could not be loaded</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-500">{message}</p>
      <Button className="mt-5" onClick={onRetry} size="sm" variant="outline">
        <RefreshCw className="size-3.5" /> Try again
      </Button>
    </div>
  )
}

export function CalculationHistorySidebar({
  refreshToken,
  onOpenChange,
}: CalculationHistorySidebarProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [filter, setFilter] = useState<HistoryFilter>('all')
  const [items, setItems] = useState<CalculationHistorySummary[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [selectedSummary, setSelectedSummary] = useState<CalculationHistorySummary | null>(null)
  const [selectedDetail, setSelectedDetail] = useState<CalculationHistoryDetail | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const drawerRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const backButtonRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRequestRef = useRef(0)
  const detailRequestRef = useRef(0)

  const methodFilter = filter === 'all' ? undefined : filter

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [items],
  )

  const setOpen = useCallback(
    (open: boolean) => {
      setIsOpen(open)
      onOpenChange?.(open)
      if (!open) {
        setSelectedSummary(null)
        setSelectedDetail(null)
        setDetailError(null)
      }
    },
    [onOpenChange],
  )

  const loadInitial = useCallback(async () => {
    const requestId = ++listRequestRef.current
    setIsLoading(true)
    setIsLoadingMore(false)
    setListError(null)

    try {
      if (!window.electronAPI?.history) {
        throw new Error('Calculation history is unavailable in this app session.')
      }

      const nextItems = await window.electronAPI.history.list({
        limit: PAGE_SIZE,
        offset: 0,
        method: methodFilter,
      })
      if (requestId !== listRequestRef.current) return

      setItems(nextItems)
      setHasMore(nextItems.length === PAGE_SIZE)
    } catch (error) {
      if (requestId !== listRequestRef.current) return
      setItems([])
      setHasMore(false)
      setListError(error instanceof Error ? error.message : 'The saved calculation ledger is unavailable.')
    } finally {
      if (requestId === listRequestRef.current) setIsLoading(false)
    }
  }, [methodFilter])

  useEffect(() => {
    if (!isOpen) return

    setSelectedSummary(null)
    setSelectedDetail(null)
    setDetailError(null)
    void loadInitial()
  }, [filter, isOpen, loadInitial, refreshToken])

  useEffect(() => {
    if (!isOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        return
      }

      if (event.key !== 'Tab' || !drawerRef.current) return

      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('aria-hidden'))

      if (focusable.length === 0) {
        event.preventDefault()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      window.setTimeout(() => triggerRef.current?.focus(), 0)
    }
  }, [isOpen, setOpen])

  useEffect(() => {
    if (!selectedSummary) return
    const focusTimer = window.setTimeout(() => backButtonRef.current?.focus(), 0)
    return () => window.clearTimeout(focusTimer)
  }, [selectedSummary])

  const loadMore = async () => {
    if (isLoadingMore || !hasMore) return

    const requestId = ++listRequestRef.current
    setIsLoadingMore(true)
    setListError(null)

    try {
      if (!window.electronAPI?.history) {
        throw new Error('Calculation history is unavailable in this app session.')
      }
      const nextItems = await window.electronAPI.history.list({
        limit: PAGE_SIZE,
        offset: items.length,
        method: methodFilter,
      })
      if (requestId !== listRequestRef.current) return

      setItems((current) => {
        const knownIds = new Set(current.map((item) => item.id))
        return [...current, ...nextItems.filter((item) => !knownIds.has(item.id))]
      })
      setHasMore(nextItems.length === PAGE_SIZE)
    } catch (error) {
      if (requestId !== listRequestRef.current) return
      setListError(error instanceof Error ? error.message : 'More calculations could not be loaded.')
    } finally {
      if (requestId === listRequestRef.current) setIsLoadingMore(false)
    }
  }

  const selectItem = async (summary: CalculationHistorySummary) => {
    const requestId = ++detailRequestRef.current
    setSelectedSummary(summary)
    setSelectedDetail(null)
    setDetailError(null)
    setIsDetailLoading(true)

    try {
      if (!window.electronAPI?.history) {
        throw new Error('Calculation history is unavailable in this app session.')
      }
      const detail = await window.electronAPI.history.get(summary.id)
      if (requestId !== detailRequestRef.current) return
      if (!detail) throw new Error('This saved calculation could not be found.')
      setSelectedDetail(detail)
    } catch (error) {
      if (requestId !== detailRequestRef.current) return
      setDetailError(error instanceof Error ? error.message : 'The calculation details are unavailable.')
    } finally {
      if (requestId === detailRequestRef.current) setIsDetailLoading(false)
    }
  }

  const showList = () => {
    detailRequestRef.current += 1
    setSelectedSummary(null)
    setSelectedDetail(null)
    setDetailError(null)
    setIsDetailLoading(false)
    window.setTimeout(() => {
      drawerRef.current?.querySelector<HTMLButtonElement>('[data-history-filter]')?.focus()
    }, 0)
  }

  return (
    <>
      {!isOpen ? (
        <Button
          aria-label="Open calculation history"
          aria-controls="calculation-history-drawer"
          aria-expanded="false"
          className="fixed top-1/2 right-0 z-40 h-auto -translate-y-1/2 flex-col gap-2 rounded-r-none border-zinc-950 bg-zinc-950 px-2.5 py-3 text-lime-300 shadow-[-10px_12px_28px_rgba(24,24,27,0.2)] hover:bg-zinc-800"
          onClick={() => setOpen(true)}
          ref={triggerRef}
        >
          <History className="size-4" />
          <span className="rotate-180 text-[0.63rem] font-semibold uppercase tracking-[0.14em] [writing-mode:vertical-rl]">
            History
          </span>
        </Button>
      ) : null}

      {isOpen ? (
        <div className="fixed inset-0 z-[100]">
          <button
            aria-label="Close calculation history"
            className="absolute inset-0 cursor-default bg-zinc-950/38 backdrop-blur-[1px] animate-in fade-in duration-200 motion-reduce:animate-none"
            onClick={() => setOpen(false)}
            tabIndex={-1}
            type="button"
          />

          <aside
            aria-labelledby="calculation-history-title"
            aria-modal="true"
            className="absolute inset-y-0 right-0 flex w-full max-w-[43rem] flex-col border-l border-zinc-950/15 bg-[#f8faf5] shadow-[-24px_0_64px_rgba(24,24,27,0.2)] animate-in slide-in-from-right duration-300 motion-reduce:animate-none"
            id="calculation-history-drawer"
            ref={drawerRef}
            role="dialog"
          >
            <header className="shrink-0 bg-zinc-950 px-5 py-5 text-white sm:px-6">
              <div className="flex items-start justify-between gap-5">
                <div className="min-w-0">
                  {selectedSummary ? (
                    <Button
                      className="-ml-2 mb-3 h-7 px-2 text-zinc-300 hover:bg-white/10 hover:text-white"
                      onClick={showList}
                      ref={backButtonRef}
                      size="sm"
                      variant="ghost"
                    >
                      <ArrowLeft className="size-3.5" /> Back to history
                    </Button>
                  ) : (
                    <p className="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-lime-300">
                      Calculation ledger
                    </p>
                  )}
                  <h2 id="calculation-history-title" className="mt-1 truncate text-2xl font-semibold tracking-tight">
                    {selectedSummary ? selectedSummary.documentId : 'Calculation history'}
                  </h2>
                  <p className="mt-1.5 text-sm leading-5 text-zinc-400">
                    {selectedSummary
                      ? `${getMethodLabel(selectedSummary.method)} · ${formatDate(selectedSummary.createdAt, true)}`
                      : 'Reopen the exact inputs and results saved at calculation time.'}
                  </p>
                </div>
                <Button
                  aria-label="Close calculation history"
                  className="size-9 shrink-0 text-zinc-300 hover:bg-white/10 hover:text-white"
                  onClick={() => setOpen(false)}
                  ref={closeButtonRef}
                  size="icon"
                  variant="ghost"
                >
                  <X className="size-4" />
                </Button>
              </div>

              {selectedSummary ? (
                <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-white/10 bg-white/10">
                  <div className="bg-zinc-950 px-3 py-3">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-zinc-500">Total emissions</p>
                    <p className="mt-1 font-mono text-base font-semibold tabular-nums text-lime-300">
                      {kg.format(selectedSummary.totalEmissionsKgCo2e)} kg CO2e
                    </p>
                  </div>
                  <div className="bg-zinc-950 px-3 py-3 text-right">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-zinc-500">Recorded spend</p>
                    <p className="mt-1 font-mono text-base font-semibold tabular-nums text-white">
                      {sgd.format(selectedSummary.totalAmountSgd)}
                    </p>
                  </div>
                </div>
              ) : null}
            </header>

            {!selectedSummary ? (
              <div className="shrink-0 border-b border-zinc-900/10 bg-white/85 px-5 py-3 backdrop-blur sm:px-6">
                <div aria-label="Filter calculation history" className="flex items-center gap-1" role="group">
                  {filters.map((item) => (
                    <Button
                      aria-pressed={filter === item.id}
                      className={cn(
                        'h-8 rounded-full border px-3 text-xs',
                        filter === item.id
                          ? 'border-zinc-950 bg-zinc-950 text-lime-300 hover:bg-zinc-900'
                          : 'border-transparent bg-transparent text-zinc-500 hover:border-zinc-900/10 hover:bg-zinc-100 hover:text-zinc-950',
                      )}
                      key={item.id}
                      onClick={() => setFilter(item.id)}
                      data-history-filter={item.id}
                      size="sm"
                      variant="ghost"
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {!selectedSummary ? (
                <div className="px-5 py-6 sm:px-6">
                  {isLoading ? <TimelineSkeleton /> : null}
                  {!isLoading && listError && items.length === 0 ? (
                    <ErrorState message={listError} onRetry={() => void loadInitial()} />
                  ) : null}
                  {!isLoading && !listError && sortedItems.length === 0 ? <EmptyState filter={filter} /> : null}
                  {!isLoading && sortedItems.length > 0 ? (
                    <>
                      <div className="mb-4 flex items-center justify-between gap-4 text-xs text-zinc-500">
                        <span className="flex items-center gap-1.5">
                          <Clock3 className="size-3.5" /> Newest first
                        </span>
                        <span className="font-mono tabular-nums">{sortedItems.length} loaded</span>
                      </div>
                      <ol className="relative space-y-4 before:absolute before:top-6 before:bottom-6 before:left-[0.43rem] before:w-px before:bg-zinc-900/15">
                        {sortedItems.map((item) => (
                          <TimelineItem item={item} key={item.id} onSelect={selectItem} />
                        ))}
                      </ol>
                      {listError ? (
                        <div className="mt-5 flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">
                          <span className="flex items-center gap-2">
                            <AlertCircle className="size-4 shrink-0" /> {listError}
                          </span>
                          <Button onClick={() => void loadMore()} size="sm" variant="outline">Retry</Button>
                        </div>
                      ) : null}
                      {hasMore && !listError ? (
                        <div className="mt-6 flex justify-center">
                          <Button disabled={isLoadingMore} onClick={() => void loadMore()} variant="outline">
                            {isLoadingMore ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> : null}
                            {isLoadingMore ? 'Loading' : 'Load more'}
                          </Button>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : (
                <div className="px-5 py-6 sm:px-6">
                  {isDetailLoading ? (
                    <div className="flex min-h-56 flex-col items-center justify-center text-center" role="status">
                      <Loader2 className="size-6 animate-spin text-lime-700 motion-reduce:animate-none" />
                      <p className="mt-3 text-sm font-medium text-zinc-700">Loading saved calculation</p>
                      <p className="mt-1 text-xs text-zinc-500">Retrieving the immutable result snapshot.</p>
                    </div>
                  ) : null}
                  {!isDetailLoading && detailError ? (
                    <ErrorState message={detailError} onRetry={() => void selectItem(selectedSummary)} />
                  ) : null}
                  {!isDetailLoading && selectedDetail ? (
                    <CalculationHistoryDetails record={selectedDetail} />
                  ) : null}
                </div>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  )
}

export default CalculationHistorySidebar
