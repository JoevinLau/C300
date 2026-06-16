import { useEffect, useState } from 'react'
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

import Method1Page from '@/pages/Method1Page'
import Method2Page from '@/pages/Method2Page'
import { AppBackground } from '@/components/AppBackground'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const modules = [
  {
    icon: DatabaseZap,
    title: 'NAICS mapping',
    href: '#naics-mapping',
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
    description:
      'Split invoice spend across raw material, fabrication, and surface treatment, then calculate emissions with NAICS factors.',
  },
  {
    icon: BarChart3,
    title: 'Method 2',
    href: '#method-2',
    description:
      'Estimate emissions from activity data such as energy use, materials, logistics, or production volume.',
  },
  {
    icon: Workflow,
    title: 'Method 3',
    href: '#method-3',
    description:
      'Calculate spend-based emissions using purchase amounts and mapped sector emission factors.',
  },
]

const sampleMappings = [
  {
    company: 'Precision Metal Works',
    activity: 'Machined components',
    code: '332710',
    sector: 'Machine Shops',
  },
  {
    company: 'Advanced Coatings Ltd',
    activity: 'Surface treatment',
    code: '332812',
    sector: 'Metal Coating and Engraving',
  },
  {
    company: 'Motion Systems Pte Ltd',
    activity: 'Industrial automation',
    code: '333249',
    sector: 'Industrial Machinery Manufacturing',
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
                href={module.href}
                className="group grid min-h-[15rem] grid-rows-[auto_1fr_auto] rounded-lg border border-zinc-900/12 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-1 hover:border-zinc-950 hover:shadow-xl hover:shadow-zinc-950/10 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none"
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
                  Open workflow
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>
    </AppBackground>
  )
}

function NaicsMappingPage() {
  return (
    <AppBackground>
      <section className="relative z-10 mx-auto grid min-h-[calc(100vh-2rem)] w-full max-w-7xl gap-4 lg:grid-cols-[15rem_1fr]">
        <aside className="rounded-lg bg-zinc-950 p-5 text-white">
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

          <div className="space-y-4">
            <div className="flex size-12 items-center justify-center rounded-md bg-lime-300 text-zinc-950">
              <DatabaseZap className="size-6" />
            </div>
            <h1 className="text-4xl font-semibold tracking-tight">
              NAICS Mapping
            </h1>
            <p className="text-sm leading-6 text-zinc-300">
              Prepare company, supplier, or spend-category records by assigning NAICS codes before calculating
              sector-based carbon factors.
            </p>
          </div>
        </aside>

        <div className="grid gap-4 lg:grid-cols-[1fr_19rem]">
          <section className="rounded-lg border border-zinc-900/12 bg-white shadow-sm">
            <div className="border-b border-zinc-900/10 p-5">
              <CardTitle className="text-2xl">Mapping Workspace</CardTitle>
              <CardDescription className="mt-2">
                A starting point for uploading data, searching sectors, and reviewing suggested mappings.
              </CardDescription>
            </div>
            <div className="grid gap-0 border-b border-zinc-900/10 sm:grid-cols-2">
              <button className="flex items-center gap-4 border-b border-zinc-900/10 p-5 text-left transition-colors hover:bg-lime-50 sm:border-b-0 sm:border-r">
                <span className="flex size-10 items-center justify-center rounded-md bg-lime-200 text-lime-950">
                  <Upload className="size-5" />
                </span>
                <span>
                  <span className="block font-medium">Upload spend file</span>
                  <span className="text-sm text-muted-foreground">CSV or spreadsheet import placeholder</span>
                </span>
              </button>
              <button className="flex items-center gap-4 p-5 text-left transition-colors hover:bg-teal-50">
                <span className="flex size-10 items-center justify-center rounded-md bg-teal-100 text-teal-900">
                  <Search className="size-5" />
                </span>
                <span>
                  <span className="block font-medium">Search NAICS sectors</span>
                  <span className="text-sm text-muted-foreground">Find matching industry classifications</span>
                </span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[42rem]">
                <div className="grid grid-cols-[1.1fr_1fr_0.6fr_1fr] bg-zinc-950 px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300">
                  <span>Company</span><span>Activity</span><span>NAICS</span><span>Sector</span>
                </div>
                {sampleMappings.map((mapping) => (
                  <div
                    key={mapping.company}
                    className="grid grid-cols-[1.1fr_1fr_0.6fr_1fr] border-t border-zinc-900/10 px-5 py-4 text-sm"
                  >
                    <span>{mapping.company}</span>
                    <span className="text-muted-foreground">{mapping.activity}</span>
                    <span className="font-mono text-lime-700">{mapping.code}</span>
                    <span className="text-muted-foreground">{mapping.sector}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <Card className="border-zinc-900/12 bg-white">
            <CardHeader className="border-b border-zinc-900/10 pb-5">
              <CardTitle>Suggested Flow</CardTitle>
              <CardDescription>How this page can evolve as you add the real calculation logic.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                'Import portfolio company or supplier spend data.',
                'Match each record to a NAICS industry classification.',
                'Review ambiguous mappings and confidence scores.',
                'Pass mapped records into Method 1, Method 2, or Method 3.',
              ].map((step, index) => (
                <div key={step} className="flex gap-3 border-b border-zinc-900/10 pb-4 last:border-0 last:pb-0">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-zinc-950 text-sm text-lime-300">
                    {index + 1}
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">{step}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>
    </AppBackground>
  )
}

function App() {
  const [route, setRoute] = useState(() => window.location.hash)

  useEffect(() => {
    const updateRoute = () => setRoute(window.location.hash)

    window.addEventListener('hashchange', updateRoute)
    return () => window.removeEventListener('hashchange', updateRoute)
  }, [])

  if (route === '#naics-mapping') {
    return <NaicsMappingPage />
  }

  if (route === '#method-1') {
    return <Method1Page />
  }

  if (route === '#method-2') {
    return <Method2Page />
  }

  return <HomePage />
}

export default App
