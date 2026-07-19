export interface DesktopStartupOptions {
  openWindow: () => void
  startBackend: () => Promise<void>
  onBackendFailure: (error: unknown) => Promise<void>
}

export async function openWindowWhileBackendStarts({
  openWindow,
  startBackend,
  onBackendFailure,
}: DesktopStartupOptions): Promise<void> {
  openWindow()
  try {
    await startBackend()
  } catch (error) {
    await onBackendFailure(error)
  }
}
