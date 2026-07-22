import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

import { configureLocalApiPort } from './api-client.ts'
import { selectAvailablePort } from './backend-port.ts'
import {
  BackendSupervisor,
  type BackendStatus,
} from './backend-supervisor.ts'

export const API_HOST = '127.0.0.1'
export const DEFAULT_API_PORT = 8000

export interface PythonCommand {
  command: string
  prefixArgs: string[]
}

export interface BackendRuntimeStatus extends BackendStatus {
  mode: 'stopped' | 'managed' | 'existing'
  port: number
}

interface BackendSupervisorLike {
  readonly status: BackendStatus
  start(): Promise<void>
  stop(): Promise<void>
}

interface BackendRuntimeDependencies {
  configurePort: (port: number) => void
  createSupervisor: (
    port: number,
    onStatusChange: (status: BackendStatus) => void,
  ) => BackendSupervisorLike
  probe: (port: number) => Promise<boolean>
  selectPort: (preferredPort: number) => Promise<number>
}

export interface DesktopBackendRuntimeOptions {
  packaged: boolean
  projectRoot: string
  resourcesPath: string
  userDataDir: string
  environment?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  preferredPort?: number
  reuseExistingApi?: boolean
  onStatusChange?: (status: BackendRuntimeStatus) => void
  dependencies?: Partial<BackendRuntimeDependencies>
}

function canRunPython(command: PythonCommand): boolean {
  try {
    const result = spawnSync(command.command, [...command.prefixArgs, '--version'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 5_000,
    })
    return result.status === 0
  } catch {
    return false
  }
}

export function resolvePythonCommand(
  candidates: PythonCommand[],
  options: {
    canRun?: (candidate: PythonCommand) => boolean
    fileExists?: (candidate: string) => boolean
  } = {},
): PythonCommand | null {
  const runnable = options.canRun ?? canRunPython
  const fileExists = options.fileExists ?? fs.existsSync
  const seen = new Set<string>()

  for (const candidate of candidates) {
    const identity = `${candidate.command}\0${candidate.prefixArgs.join('\0')}`
    if (seen.has(identity)) continue
    seen.add(identity)

    if (path.isAbsolute(candidate.command) && !fileExists(candidate.command)) continue
    if (runnable(candidate)) return candidate
  }

  return null
}

export function probeApiReadiness(port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const request = http.get(
      {
        hostname: API_HOST,
        port,
        path: '/health/ready',
        timeout: 1_500,
      },
      (response) => {
        let body = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          if (body.length < 16_384) body += chunk
        })
        response.on('end', () => {
          try {
            const result = JSON.parse(body) as {
              service?: string
              status?: string
              checks?: Record<string, string>
            }
            if (
              response.statusCode === 200 &&
              result.service === 'c300-api' &&
              result.status === 'ready'
            ) {
              resolve(true)
              return
            }
            if (result.service === 'c300-api' && result.status === 'not_ready') {
              const unavailable = Object.entries(result.checks ?? {})
                .filter(([, status]) => status !== 'ready')
                .map(([name]) => name.replaceAll('_', ' '))
                .join(', ')
              reject(
                new Error(
                  `Backend dependencies are unavailable${unavailable ? `: ${unavailable}` : ''}.`,
                ),
              )
              return
            }
            resolve(false)
          } catch (error) {
            if (error instanceof SyntaxError) resolve(false)
            else reject(error)
          }
        })
      },
    )

    request.on('error', () => resolve(false))
    request.on('timeout', () => {
      request.destroy()
      resolve(false)
    })
  })
}

function createBackendProcessLauncher(options: DesktopBackendRuntimeOptions, port: number) {
  const platform = options.platform ?? process.platform
  const environment = options.environment ?? process.env
  const playwrightBrowsersDir = options.packaged
    ? path.join(options.resourcesPath, 'playwright-browsers')
    : path.join(options.projectRoot, '.playwright-browsers')
  const env = {
    ...environment,
    ELECTRON_RUN_AS_NODE: undefined,
    PLAYWRIGHT_BROWSERS_PATH: playwrightBrowsersDir,
    RAG_DATA_DIR: path.join(options.userDataDir, 'rag-data'),
    C300_API_PORT: String(port),
  }

  return (): ChildProcess => {
    if (options.packaged) {
      const apiExecutable = path.join(options.resourcesPath, 'backend', 'c300-api.exe')
      if (!fs.existsSync(apiExecutable)) {
        throw new Error(`Bundled backend not found at ${apiExecutable}.`)
      }
      return spawn(apiExecutable, [], {
        cwd: path.dirname(apiExecutable),
        env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    }

    const apiScript = path.join(options.projectRoot, 'api', 'main.py')
    const pythonName = platform === 'win32' ? 'python.exe' : 'python'
    const binDir = platform === 'win32' ? 'Scripts' : 'bin'
    const candidates: PythonCommand[] = [
      ...(environment.PYTHON ? [{ command: environment.PYTHON, prefixArgs: [] }] : []),
      { command: path.join(options.projectRoot, '.venv-api', binDir, pythonName), prefixArgs: [] },
      { command: path.join(options.projectRoot, 'api', 'venv', binDir, pythonName), prefixArgs: [] },
      { command: path.join(options.projectRoot, '.venv', binDir, pythonName), prefixArgs: [] },
      { command: platform === 'win32' ? 'python' : 'python3', prefixArgs: [] },
      ...(platform === 'win32' ? [{ command: 'py', prefixArgs: ['-3'] }] : []),
      { command: 'python', prefixArgs: [] },
    ]
    const python = resolvePythonCommand(candidates)
    if (!python) throw new Error('No usable Python executable was found.')

    return spawn(python.command, [...python.prefixArgs, apiScript], {
      cwd: options.projectRoot,
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  }
}

function createDefaultSupervisor(
  options: DesktopBackendRuntimeOptions,
  port: number,
  probe: (port: number) => Promise<boolean>,
  onStatusChange: (status: BackendStatus) => void,
): BackendSupervisor {
  return new BackendSupervisor({
    launch: createBackendProcessLauncher(options, port),
    probe: () => probe(port),
    onStatusChange,
  })
}

export class DesktopBackendRuntime {
  private readonly preferredPort: number
  private readonly reuseExistingApi: boolean
  private readonly onStatusChange?: (status: BackendRuntimeStatus) => void
  private readonly dependencies: BackendRuntimeDependencies
  private supervisor: BackendSupervisorLike | null = null
  private mode: BackendRuntimeStatus['mode'] = 'stopped'
  private selectedPort: number
  private startTask: Promise<void> | null = null

  constructor(options: DesktopBackendRuntimeOptions) {
    this.preferredPort = options.preferredPort ?? DEFAULT_API_PORT
    this.selectedPort = this.preferredPort
    this.reuseExistingApi = options.reuseExistingApi ?? false
    this.onStatusChange = options.onStatusChange
    const probe = options.dependencies?.probe ?? probeApiReadiness
    this.dependencies = {
      configurePort: options.dependencies?.configurePort ?? configureLocalApiPort,
      createSupervisor:
        options.dependencies?.createSupervisor ??
        ((port, onStatusChange) => createDefaultSupervisor(options, port, probe, onStatusChange)),
      probe,
      selectPort: options.dependencies?.selectPort ?? selectAvailablePort,
    }
  }

  get port(): number {
    return this.selectedPort
  }

  get status(): BackendRuntimeStatus {
    if (this.mode === 'existing') {
      return { state: 'ready', attempt: 0, mode: 'existing', port: this.selectedPort }
    }
    const status = this.supervisor?.status ?? { state: 'stopped' as const, attempt: 0 }
    return { ...status, mode: this.mode, port: this.selectedPort }
  }

  assertReady(): void {
    const status = this.status
    if (status.state === 'ready') return
    throw new Error(
      `The calculation backend is ${status.state}. Wait for recovery to finish, then try again.`,
    )
  }

  waitUntilReady(): Promise<void> {
    if (this.status.state === 'ready') return Promise.resolve()
    if (this.startTask) return this.startTask

    try {
      this.assertReady()
      return Promise.resolve()
    } catch (error) {
      return Promise.reject(error)
    }
  }

  start(): Promise<void> {
    if (this.status.state === 'ready') return Promise.resolve()
    if (this.startTask) return this.startTask

    const task = this.startInternal()
    const wrappedTask = task.finally(() => {
      if (this.startTask === wrappedTask) this.startTask = null
    })
    this.startTask = wrappedTask
    return wrappedTask
  }

  async stop(): Promise<void> {
    await this.supervisor?.stop()
    this.mode = 'stopped'
    this.emitStatus({ state: 'stopped', attempt: 0 })
  }

  private async startInternal(): Promise<void> {
    if (!this.supervisor) {
      let existingReady = false
      try {
        existingReady = await this.dependencies.probe(this.preferredPort)
      } catch {
        // A C300 API with failed dependencies is not safe to reuse.
      }

      if (existingReady && this.reuseExistingApi) {
        this.selectedPort = this.preferredPort
        this.dependencies.configurePort(this.selectedPort)
        this.mode = 'existing'
        this.emitStatus({ state: 'ready', attempt: 0 })
        return
      }

      this.selectedPort = await this.dependencies.selectPort(this.preferredPort)
      this.dependencies.configurePort(this.selectedPort)
      this.mode = 'managed'
      this.supervisor = this.dependencies.createSupervisor(
        this.selectedPort,
        (status) => this.emitStatus(status),
      )
    }

    this.mode = 'managed'
    await this.supervisor.start()
  }

  private emitStatus(status: BackendStatus): void {
    this.onStatusChange?.({
      ...status,
      mode: this.mode,
      port: this.selectedPort,
    })
  }
}
