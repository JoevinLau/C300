import { lazy, Suspense, useEffect, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  DatabaseZap,
  FileSpreadsheet,
  Search,
  Upload,
  Workflow,
} from 'lucide-react'

import { AppBackground } from '@/components/AppBackground'
import { CalculationHistorySidebar } from '@/features/calculation-history/CalculationHistorySidebar'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const Method1Page = lazy(() => import('@/features/method1/Method1Page'))
const Method2Page = lazy(() => import('@/features/method2/Method2Page'))
const Method3Page = lazy(() => import('@/features/method3/Method3Page'))
const NaicsMappingPage = lazy(() => import('@/features/naics-mapping/NaicsMappingPage'))

const modules = [
  {
    icon: DatabaseZap,
    title: 'NAICS mapping',
    href: '#naics-mapping',
    disabled: false,
    description:
      'Map portfolio companies or spend categories to NAICS codes before calculating emissions factors.',
    bullets: [
      'Upload or review company and supplier spend records.',
      'Search NAICS sectors and assign the right industry code.',
      'Prepare mapped records for Method 1, Method 2, or Method 3.',
    ],
  },
  {
    icon: FileSpreadsheet,
    title: 'USEEIO',
    href: '#method-1',
    disabled: false,
    description:
      'Split invoice spend across raw material, fabrication, and surface treatment, then calculate emissions with NAICS factors.',
  },
  {
    icon: BarChart3,
    title: 'Method 2',
    href: '#method-2',
    disabled: false,
    description:
      'Estimate emissions from activity data such as energy use, materials, logistics, or production volume.',
  },
  {
    icon: Workflow,
    title: 'Method 3',
    href: '#method-3',
    disabled: false,
    description:
      'Calculate spend-based emissions using purchase amounts and mapped sector emission factors.',
  },
]

function HomePage() {
  return (
    <AppBackground>
      <section className="relative z-10 mx-auto grid min-h-[calc(100vh-2rem)] w-full max-w-7xl gap-4 lg:grid-cols-[16rem_1fr]">
        <aside className="flex flex-col justify-between rounded-lg bg-zinc-950 p-5 text-white shadow-2xl shadow-zinc-950/20">
          <div>
            <div className="mb-10 flex size-12 items-center justify-center rounded-md bg-lime-300 text-zinc-950">
              <Workflow className="size-6" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-lime-300">Workspace</p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight">
              PE CarbonSpend Calculator
            </h1>
          </div>
          <p className="mt-8 text-sm leading-6 text-zinc-300">
            Select a workflow to map sectors, apply emissions calculation methods, and prepare spend-based
            carbon estimates for portfolio analysis.
          </p>
        </aside>

        <div className="grid gap-4 lg:grid-rows-[auto_1fr]">
          <div className="grid gap-4">
            <div className="rounded-lg border border-zinc-900/12 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Carbon workflows</p>
              <h2 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight text-zinc-950">
                Choose the calculation path and move straight into data entry.
              </h2>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {modules.map((module, index) => (
              <a
                key={module.title}
                href={module.disabled ? undefined : module.href}
                aria-disabled={module.disabled || undefined}
                onClick={(event) => {
                  if (module.disabled) event.preventDefault()
                }}
                className={`group grid min-h-[15rem] grid-rows-[auto_1fr_auto] rounded-lg border border-zinc-900/12 bg-white p-5 text-left shadow-sm transition-all focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none ${
                  module.disabled
                    ? 'cursor-not-allowed opacity-65'
                    : 'hover:-translate-y-1 hover:border-zinc-950 hover:shadow-xl hover:shadow-zinc-950/10'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex size-11 items-center justify-center rounded-md bg-zinc-950 text-lime-300">
                    <module.icon className="size-5" />
                  </div>
                  <span className="font-mono text-xs text-zinc-400">0{index + 1}</span>
                </div>
                <div className="mt-8">
                  <CardTitle className="text-3xl">{module.title}</CardTitle>
                  <CardDescription className="mt-3 max-w-md text-base leading-relaxed">
                    {module.description}
                  </CardDescription>
                  {module.bullets ? (
                    <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                      {module.bullets.map((item) => (
                        <li key={item} className="flex gap-2">
                          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-lime-500" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <div className="mt-6 flex items-center justify-between border-t border-zinc-900/10 pt-4 text-sm font-semibold text-zinc-950">
                  {module.disabled ? 'Coming soon' : 'Open workflow'}
                  {module.disabled ? null : <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />}
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>
    </AppBackground>
  )
}

function RouteLoadingPage() {
  return (
    <AppBackground>
      <main
        className="relative z-10 mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-7xl items-center justify-center"
        aria-busy="true"
      >
        <div
          className="w-full max-w-md rounded-lg border border-zinc-900/12 bg-white p-6 shadow-sm"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-4">
            <span
              className="flex size-11 shrink-0 items-center justify-center rounded-md bg-zinc-950 text-lime-300"
              aria-hidden="true"
            >
              <Workflow className="size-5 animate-pulse" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                Loading workflow
              </p>
              <p className="mt-1 text-sm text-zinc-700">Preparing the calculation workspace…</p>
            </div>
          </div>
        </div>
      </main>
    </AppBackground>
  )
}


function App() {
  const [route, setRoute] = useState(() => window.location.hash)
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0)

  useEffect(() => {
    const updateRoute = () => setRoute(window.location.hash)

    window.addEventListener('hashchange', updateRoute)
    return () => window.removeEventListener('hashchange', updateRoute)
  }, [])

  const refreshHistory = () => setHistoryRefreshToken((token) => token + 1)

  let page = <HomePage />
  if (route === '#naics-mapping') page = <NaicsMappingPage />
  if (route === '#method-1') page = <Method1Page onHistorySaved={refreshHistory} />
  if (route === '#method-2') page = <Method2Page onHistorySaved={refreshHistory} />
  if (route === '#method-3') page = <Method3Page onHistorySaved={refreshHistory} />

  return (
    <>
      <Suspense fallback={<RouteLoadingPage />}>{page}</Suspense>
      <CalculationHistorySidebar refreshToken={historyRefreshToken} />
    </>
  )
}

export default App
