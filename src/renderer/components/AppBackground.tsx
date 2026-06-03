export function AppBackground({ children }: { children: React.ReactNode }) {
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
