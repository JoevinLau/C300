import { ArrowRight, MonitorCog, PackageCheck, Zap } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

function App() {
  const { electron, node, chrome } = window.electronAPI.versions

  const stats = [
    { label: 'Platform', value: window.electronAPI.platform },
    { label: 'Electron', value: electron },
    { label: 'Node', value: node },
    { label: 'Chrome', value: chrome },
  ]

  const features = [
    {
      icon: MonitorCog,
      title: 'Electron shell',
      description: 'Main, preload, and renderer layers are already separated.',
    },
    {
      icon: PackageCheck,
      title: 'shadcn base',
      description: 'Reusable UI primitives live under src/renderer/components.',
    },
    {
      icon: Zap,
      title: 'Tailwind ready',
      description: 'Design tokens are driven by CSS variables in styles.css.',
    },
  ]

  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(120,119,198,0.25),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.18),transparent_30%)] px-6 py-10">
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-6xl flex-col justify-center gap-8">
        <div className="max-w-3xl space-y-6">
          <div className="inline-flex items-center rounded-full border bg-card/70 px-3 py-1 text-sm text-muted-foreground shadow-sm backdrop-blur">
            Electron + React + TypeScript + Tailwind
          </div>

          <div className="space-y-4">
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
              A desktop app foundation with shadcn/ui styling.
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              Start from a polished renderer layout, reusable components, and a preload bridge that is ready
              for native capabilities.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button>
              Start building
              <ArrowRight />
            </Button>
            <Button variant="outline">Preload ping: {window.electronAPI.ping()}</Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title} className="border-white/10 bg-card/75 backdrop-blur">
              <CardHeader>
                <feature.icon className="size-5 text-primary" />
                <CardTitle>{feature.title}</CardTitle>
                <CardDescription>{feature.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>

        <Card className="border-white/10 bg-card/75 backdrop-blur">
          <CardHeader>
            <CardTitle>Runtime Details</CardTitle>
            <CardDescription>Values exposed through the Electron preload bridge.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((item) => (
              <div key={item.label} className="rounded-lg border bg-background/50 p-4">
                <p className="text-sm text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-xl font-semibold">{item.value}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </main>
  )
}

export default App
