export function AppBackground({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[#f4f1e8] px-4 py-4 text-zinc-950 sm:px-5 lg:px-6">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-20 bg-[linear-gradient(180deg,#f4f1e8_0%,#faf8f1_42%,#ece7db_100%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 opacity-70 [background-image:linear-gradient(rgba(39,39,42,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(39,39,42,0.06)_1px,transparent_1px)] [background-size:24px_24px]"
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
