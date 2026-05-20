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
  },
  {
    icon: FileSpreadsheet,
    title: 'Method 1',
    href: '#method-1',
    description:
      'Use supplier-specific emissions data when direct carbon reporting is available and verified.',
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

function AppBackground({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[#071014] px-6 py-10">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_18%_12%,rgba(34,197,94,0.2),transparent_28%),radial-gradient(circle_at_82%_20%,rgba(14,165,233,0.18),transparent_26%),linear-gradient(135deg,#071014_0%,#0d171c_44%,#111827_100%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 opacity-[0.18] [background-image:linear-gradient(rgba(255,255,255,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.18)_1px,transparent_1px)] [background-size:48px_48px]"
      />
      <div
        aria-hidden="true"
        className="absolute -left-24 top-24 -z-10 h-72 w-96 border border-emerald-300/20 bg-emerald-400/10 [clip-path:polygon(0_18%,72%_0,100%_48%,42%_100%,0_82%)]"
      />
      <div
        aria-hidden="true"
        className="absolute -right-28 bottom-10 -z-10 h-96 w-[32rem] border border-cyan-300/20 bg-cyan-400/10 [clip-path:polygon(22%_0,100%_16%,82%_100%,0_76%)]"
      />
      <div
        aria-hidden="true"
        className="absolute right-16 top-28 -z-10 h-40 w-56 rotate-12 border border-white/10 bg-white/[0.03] [clip-path:polygon(10%_0,100%_0,74%_100%,0_68%)]"
      />

      {children}
    </main>
  )
}

function HomePage() {
  return (
    <AppBackground>
      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-5xl flex-col justify-center gap-10">
        <div className="mx-auto max-w-3xl space-y-4 text-center">
          <h1 className="bg-gradient-to-br from-white via-slate-100 to-emerald-200 bg-clip-text text-4xl font-semibold tracking-tight text-balance text-transparent sm:text-6xl">
            PE CarbonSpend Calculator
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            Select a workflow to map sectors, apply emissions calculation methods, and prepare spend-based
            carbon estimates for portfolio analysis.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          {modules.map((module) => (
            <a
              key={module.title}
              href={module.href}
              className="group rounded-xl border border-white/10 bg-slate-950/55 py-6 text-left text-card-foreground shadow-sm backdrop-blur-xl transition-all hover:-translate-y-1 hover:border-emerald-300/45 hover:bg-slate-900/75 hover:shadow-xl hover:shadow-emerald-950/40 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none"
            >
              <div className="flex flex-col gap-4 px-6 sm:flex-row sm:items-center sm:justify-between">
                <CardHeader className="flex-1 px-0">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-300/10 text-emerald-200">
                      <module.icon className="size-6" />
                    </div>
                    <div className="space-y-2">
                      <CardTitle className="text-2xl">{module.title}</CardTitle>
                      <CardDescription className="text-base leading-relaxed">
                        {module.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-emerald-100">
                  <ArrowRight className="size-5"/>
                </div>
              </div>
            </a>
          ))}
        </div>
      </section>
    </AppBackground>
  )
}

function NaicsMappingPage() {
  return (
    <AppBackground>
      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-6xl flex-col gap-8">
        <div>
          <Button
            variant="ghost"
            className="mb-6"
            onClick={() => {
              window.location.hash = ''
            }}
          >
            <ArrowLeft />
            Back to workflows
          </Button>

          <div className="max-w-3xl space-y-4">
            <div className="flex size-12 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-300/10 text-emerald-200">
              <DatabaseZap className="size-6" />
            </div>
            <h1 className="bg-gradient-to-br from-white via-slate-100 to-emerald-200 bg-clip-text text-4xl font-semibold tracking-tight text-transparent sm:text-5xl">
              NAICS Mapping
            </h1>
            <p className="text-lg text-muted-foreground">
              Prepare company, supplier, or spend-category records by assigning NAICS codes before calculating
              sector-based carbon factors.
            </p>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
          <Card className="border-white/10 bg-slate-950/55 backdrop-blur-xl">
            <CardHeader>
              <CardTitle>Mapping Workspace</CardTitle>
              <CardDescription>
                A starting point for uploading data, searching sectors, and reviewing suggested mappings.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <button className="flex items-center gap-3 rounded-xl border border-dashed border-emerald-300/30 bg-emerald-300/5 p-4 text-left transition-colors hover:bg-emerald-300/10">
                  <Upload className="size-5 text-emerald-200" />
                  <span>
                    <span className="block font-medium">Upload spend file</span>
                    <span className="text-sm text-muted-foreground">CSV or spreadsheet import placeholder</span>
                  </span>
                </button>
                <button className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left transition-colors hover:bg-white/[0.06]">
                  <Search className="size-5 text-cyan-200" />
                  <span>
                    <span className="block font-medium">Search NAICS sectors</span>
                    <span className="text-sm text-muted-foreground">Find matching industry classifications</span>
                  </span>
                </button>
              </div>

              <div className="overflow-hidden rounded-xl border border-white/10">
                <div className="grid grid-cols-[1.1fr_1fr_0.6fr_1fr] bg-white/[0.04] px-4 py-3 text-sm font-medium text-muted-foreground">
                  <span>Company</span>
                  <span>Activity</span>
                  <span>NAICS</span>
                  <span>Sector</span>
                </div>
                {sampleMappings.map((mapping) => (
                  <div
                    key={mapping.company}
                    className="grid grid-cols-[1.1fr_1fr_0.6fr_1fr] border-t border-white/10 px-4 py-3 text-sm"
                  >
                    <span>{mapping.company}</span>
                    <span className="text-muted-foreground">{mapping.activity}</span>
                    <span className="font-mono text-emerald-200">{mapping.code}</span>
                    <span className="text-muted-foreground">{mapping.sector}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-slate-950/55 backdrop-blur-xl">
            <CardHeader>
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
                <div key={step} className="flex gap-3">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-300/10 text-sm text-emerald-200">
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

  return <HomePage />
}

export default App
