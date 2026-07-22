export function AppBackground({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative isolate min-h-[100dvh] overflow-hidden bg-[#f3f4ef] px-3 py-3 text-zinc-950 sm:px-4 sm:py-4 lg:px-5">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-20 bg-[linear-gradient(180deg,#f7f8f4_0%,#f3f4ef_48%,#eceee8_100%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 opacity-40 [background-image:linear-gradient(rgba(39,39,42,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(39,39,42,0.055)_1px,transparent_1px)] [background-size:28px_28px]"
      />
      <div
        aria-hidden="true"
        className="hidden"
      />
      <div
        aria-hidden="true"
        className="hidden"
      />
      <div
        aria-hidden="true"
        className="hidden"
      />
      {children}
    </main>
  )
}
