import type { ChildProcess } from 'node:child_process'

export type BackendState = 'stopped' | 'starting' | 'ready' | 'restarting' | 'failed'

export interface BackendStatus {
  state: BackendState
  attempt: number
  error?: string
}

interface BackendSupervisorOptions {
  launch: () => ChildProcess
  probe: () => Promise<boolean>
  startupTimeoutMs?: number
  probeIntervalMs?: number
  restartDelaysMs?: number[]
  maxStderrCharacters?: number
  onStatusChange?: (status: BackendStatus) => void
}

const DEFAULT_STARTUP_TIMEOUT_MS = 30_000
const DEFAULT_PROBE_INTERVAL_MS = 250
const DEFAULT_RESTART_DELAYS_MS = [0, 1_000, 3_000, 10_000]
const DEFAULT_MAX_STDERR_CHARACTERS = 64 * 1024

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export function appendBoundedLog(current: string, chunk: string, limit: number): string {
  const combined = current + chunk
  return combined.length <= limit ? combined : combined.slice(-limit)
}

export class BackendSupervisor {
  private readonly options: Required<
    Omit<BackendSupervisorOptions, 'onStatusChange'>
  > &
    Pick<BackendSupervisorOptions, 'onStatusChange'>
  private child: ChildProcess | null = null
  private stopping = false
  private generation = 0
  private startTask: Promise<void> | null = null
  private restartTask: Promise<void> | null = null
  private currentStatus: BackendStatus = { state: 'stopped', attempt: 0 }

  constructor(options: BackendSupervisorOptions) {
    this.options = {
      launch: options.launch,
      probe: options.probe,
      startupTimeoutMs: options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS,
      probeIntervalMs: options.probeIntervalMs ?? DEFAULT_PROBE_INTERVAL_MS,
      restartDelaysMs: options.restartDelaysMs ?? DEFAULT_RESTART_DELAYS_MS,
      maxStderrCharacters:
        options.maxStderrCharacters ?? DEFAULT_MAX_STDERR_CHARACTERS,
      onStatusChange: options.onStatusChange,
    }
  }

  get status(): BackendStatus {
    return { ...this.currentStatus }
  }

  start(): Promise<void> {
    if (this.currentStatus.state === 'ready') return Promise.resolve()
    if (this.startTask) return this.startTask
    if (this.restartTask) {
      return this.restartTask.then(() => {
        if (this.currentStatus.state === 'ready') return
        return this.start()
      })
    }

    this.stopping = false
    const generation = ++this.generation
    const task = this.launchAndWait('starting', 1, generation)
    const wrappedTask = task.finally(() => {
      if (this.startTask === wrappedTask) this.startTask = null
    })
    this.startTask = wrappedTask
    return wrappedTask
  }

  async stop(): Promise<void> {
    this.stopping = true
    this.generation += 1
    const child = this.child
    this.child = null
    if (child && !child.killed) child.kill()
    this.setStatus({ state: 'stopped', attempt: 0 })

    try {
      await this.restartTask
    } catch {
      // A failed recovery is already reflected in the public status.
    }
  }

  private setStatus(status: BackendStatus) {
    this.currentStatus = status
    this.options.onStatusChange?.({ ...status })
  }

  private async launchAndWait(
    state: 'starting' | 'restarting',
    attempt: number,
    generation: number,
  ): Promise<void> {
    if (this.stopping || generation !== this.generation) return

    this.setStatus({ state, attempt })
    let child: ChildProcess
    try {
      child = this.options.launch()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.setStatus({
        state: state === 'starting' ? 'failed' : 'restarting',
        attempt,
        error: message,
      })
      throw new Error(message, { cause: error })
    }

    this.child = child
    child.stdout?.resume()
    let stderr = ''
    child.stderr?.on('data', (chunk) => {
      stderr = appendBoundedLog(
        stderr,
        chunk.toString(),
        this.options.maxStderrCharacters,
      )
    })

    let startupPending = true
    let rejectTermination: (error: Error) => void = () => undefined
    const terminated = new Promise<never>((_resolve, reject) => {
      rejectTermination = reject
    })

    const handleTermination = (message: string) => {
      if (this.child !== child) return
      this.child = null
      const detail = stderr.trim()
      const error = new Error(detail ? `${message}: ${detail}` : message)
      if (startupPending) {
        rejectTermination(error)
      } else if (!this.stopping && generation === this.generation) {
        this.beginRecovery(error)
      }
    }

    child.once('error', (error) =>
      handleTermination(`Backend process failed: ${error.message}`),
    )
    child.once('exit', (code, signal) =>
      handleTermination(
        `Backend process exited${code === null ? '' : ` with code ${code}`}${
          signal ? ` (${signal})` : ''
        }`,
      ),
    )

    try {
      await Promise.race([this.waitForReadiness(generation, child), terminated])
      if (this.child !== child || this.stopping || generation !== this.generation) {
        throw new Error('Backend startup was cancelled.')
      }
      startupPending = false
      this.setStatus({ state: 'ready', attempt })
    } catch (error) {
      startupPending = false
      if (this.child === child) {
        this.child = null
        if (!child.killed) child.kill()
      }
      const message = error instanceof Error ? error.message : String(error)
      this.setStatus({
        state: state === 'starting' ? 'failed' : 'restarting',
        attempt,
        error: message,
      })
      throw error
    }
  }

  private async waitForReadiness(
    generation: number,
    child: ChildProcess,
  ): Promise<void> {
    const deadline = Date.now() + this.options.startupTimeoutMs
    let lastProbeError: Error | null = null
    while (
      !this.stopping &&
      generation === this.generation &&
      this.child === child
    ) {
      try {
        if (await this.options.probe()) return
      } catch (error) {
        // The service may refuse connections or return 503 while dependencies warm up.
        lastProbeError = error instanceof Error ? error : new Error(String(error))
      }

      const remaining = deadline - Date.now()
      if (remaining <= 0) break
      await delay(Math.min(this.options.probeIntervalMs, remaining))
    }

    if (this.stopping || generation !== this.generation || this.child !== child) {
      throw new Error('Backend startup was cancelled.')
    }
    const lastCheck = lastProbeError ? ` Last check: ${lastProbeError.message}` : ''
    throw new Error(
      `Backend did not become ready within ${this.options.startupTimeoutMs} ms.${lastCheck}`,
    )
  }

  private beginRecovery(reason: Error) {
    if (this.restartTask || this.stopping) return

    const generation = this.generation
    const recovery = this.recover(reason, generation)
    const wrappedRecovery = recovery.finally(() => {
      if (this.restartTask === wrappedRecovery) this.restartTask = null
    })
    this.restartTask = wrappedRecovery
  }

  private async recover(reason: Error, generation: number): Promise<void> {
    let latestError = reason
    for (let index = 0; index < this.options.restartDelaysMs.length; index += 1) {
      if (this.stopping || generation !== this.generation) return

      const attempt = index + 1
      this.setStatus({ state: 'restarting', attempt, error: latestError.message })
      const waitMs = this.options.restartDelaysMs[index]
      if (waitMs > 0) await delay(waitMs)
      if (this.stopping || generation !== this.generation) return

      try {
        await this.launchAndWait('restarting', attempt, generation)
        return
      } catch (error) {
        latestError = error instanceof Error ? error : new Error(String(error))
      }
    }

    this.setStatus({
      state: 'failed',
      attempt: this.options.restartDelaysMs.length,
      error: latestError.message,
    })
  }
}
