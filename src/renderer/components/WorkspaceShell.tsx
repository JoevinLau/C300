import type { LucideIcon } from 'lucide-react'
import { ArrowLeft } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function WorkspaceFrame({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'relative z-10 mx-auto grid w-full max-w-[92rem] gap-4 pb-8 lg:grid-cols-[15rem_minmax(0,1fr)]',
        className,
      )}
    >
      {children}
    </section>
  )
}

export function WorkspaceRail({
  icon: Icon,
  eyebrow,
  title,
  description,
  children,
}: {
  icon: LucideIcon
  eyebrow: string
  title: string
  description: string
  children?: React.ReactNode
}) {
  return (
    <aside className="min-w-0 rounded-xl bg-zinc-950 p-4 text-white shadow-[0_18px_50px_rgba(24,24,27,0.18)] lg:sticky lg:top-4 lg:self-start">
      <Button
        variant="ghost"
        className="-ml-2 mb-5 text-zinc-300 hover:bg-white/10 hover:text-white lg:mb-8"
        onClick={() => {
          window.location.hash = ''
        }}
      >
        <ArrowLeft />
        Workflows
      </Button>

      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-x-4 gap-y-3 lg:block lg:space-y-5">
        <div className="flex size-11 items-center justify-center rounded-lg bg-lime-300 text-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
          <Icon className="size-5" />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-lime-300">
            {eyebrow}
          </p>
          <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-[-0.035em]">{title}</h1>
        </div>
        <p className="col-start-2 text-sm leading-6 text-zinc-300 lg:col-auto">{description}</p>
      </div>

      {children ? <div className="mt-8 border-t border-white/10 pt-5">{children}</div> : null}
    </aside>
  )
}

export function WorkspaceIntro({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow: string
  title: string
  description?: string
  actions?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <header className="rounded-xl border border-zinc-900/10 bg-white/95 p-5 shadow-[0_10px_30px_rgba(24,39,24,0.055)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{eyebrow}</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-zinc-950 sm:text-3xl">{title}</h2>
          {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">{description}</p> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children}
    </header>
  )
}
