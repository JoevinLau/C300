import * as React from 'react'

import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-10 w-full min-w-0 rounded-lg border border-zinc-900/15 bg-white px-3 py-1 text-sm text-zinc-950 shadow-[inset_0_1px_0_rgba(24,24,27,0.05)] transition-[border-color,box-shadow,background-color] outline-none placeholder:text-zinc-400 selection:bg-lime-300/50 focus-visible:border-lime-700/60 focus-visible:ring-[3px] focus-visible:ring-lime-400/25 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:opacity-60 appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:margin-0 [&::-webkit-inner-spin-button]:margin-0',
        className,
      )}
      style={type === 'number' ? { MozAppearance: 'textfield' } : undefined}
      {...props}
    />
  )
}

export { Input }
