import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'

import { configureLocalApiPort, postCalculate, requestLocalApi } from './api-client'
import { selectAvailablePort } from './backend-port'
import { BackendSupervisor, type BackendStatus } from './backend-supervisor'
import { CalculationHistoryStore } from './calculation-history-store'
import type { CalculateRequest } from '../shared/calculator-types'
import type {
  CalculationHistoryListOptions,
  SaveCalculationHistoryInput,
} from '../shared/calculation-history-types'
import type { LocalApiRequest } from '../shared/electron-api'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
let backendSupervisor: BackendSupervisor | null = null
let usingExistingApi = false
let backendFailurePromptOpen = false
let calculationHistoryStore: CalculationHistoryStore | null = null
const API_HOST = '127.0.0.1'
const DEFAULT_API_PORT = 8000
let apiPort = DEFAULT_API_PORT

function getCalculationHistoryStore(): CalculationHistoryStore {
  if (!calculationHistoryStore) {
    throw new Error(
      'Calculation history is unavailable. Restart the app or check that its data folder is writable.',
    )
  }
  return calculationHistoryStore
}

function registerApiHandlers() {
  ipcMain.handle('calculator:calculate', async (_event, payload: CalculateRequest) => {
    assertBackendReady()
    return postCalculate(payload)
  })
  ipcMain.handle('local-api:request', async (_event, request: LocalApiRequest) => {
    assertBackendReady()
    return requestLocalApi(request)
  })

  ipcMain.handle(
    'calculation-history:save',
    (_event, input: SaveCalculationHistoryInput) => getCalculationHistoryStore().save(input),
  )
  ipcMain.handle(
    'calculation-history:list',
    (_event, options?: CalculationHistoryListOptions) =>
      getCalculationHistoryStore().list(options),
  )
  ipcMain.handle('calculation-history:get', (_event, id: string) =>
    getCalculationHistoryStore().get(id),
  )
}

function assertBackendReady() {
  if (usingExistingApi || backendSupervisor?.status.state === 'ready') return
  const state = backendSupervisor?.status.state ?? 'stopped'
  throw new Error(
    `The calculation backend is ${state}. Wait for recovery to finish, then try again.`,
  )
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
    return
  }

  void window.loadFile(path.join(__dirname, '../renderer/index.html'))
}

function canRunPython(executable: string) {
  try {
    const result = spawnSync(executable, ['--version'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 5000,
    })
    return result.status === 0
  } catch {
    return false
  }
}

function resolvePythonExecutable(venvPythons: string[]): string | null {
  const candidates = [
    ...venvPythons,
    process.platform === 'win32' ? 'python' : 'python3',
    'python3',
    'python',
  ]

  const seen = new Set<string>()
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue
    seen.add(candidate)

    if (venvPythons.includes(candidate) && !fs.existsSync(candidate)) {
      continue
    }

    if (canRunPython(candidate)) {
      return candidate
    }
  }

  return null
}

function probeApiReadiness(port = apiPort) {
  return new Promise<boolean>((resolve, reject) => {
    const request = http.get(
      {
        hostname: API_HOST,
        port,
        path: '/health/ready',
        timeout: 1500,
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

function createBackendSupervisor(port: number) {
  const projectRoot = path.join(__dirname, '..', '..')
  const ragDataDir = path.join(app.getPath('userData'), 'rag-data')
  const playwrightBrowsersDir = app.isPackaged
    ? path.join(process.resourcesPath, 'playwright-browsers')
    : path.join(projectRoot, '.playwright-browsers')
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: undefined,
    PLAYWRIGHT_BROWSERS_PATH: playwrightBrowsersDir,
    RAG_DATA_DIR: ragDataDir,
    C300_API_PORT: String(port),
  }

  const launch = () => {
    if (app.isPackaged) {
      const apiExecutable = path.join(process.resourcesPath, 'backend', 'c300-api.exe')
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

    const apiScript = path.join(projectRoot, 'api', 'main.py')
    const pythonName = process.platform === 'win32' ? 'python.exe' : 'python'
    const binDir = process.platform === 'win32' ? 'Scripts' : 'bin'
    const candidates = [
      process.env.PYTHON,
      path.join(projectRoot, '.venv-api', binDir, pythonName),
      path.join(projectRoot, 'api', 'venv', binDir, pythonName),
      path.join(projectRoot, '.venv', binDir, pythonName),
      process.platform === 'win32' ? 'python' : 'python3',
      process.platform === 'win32' ? 'py' : undefined,
    ].filter((candidate): candidate is string => Boolean(candidate))
    const pythonExecutable = resolvePythonExecutable(candidates)
    if (!pythonExecutable) {
      throw new Error('No usable Python executable was found.')
    }
    const args = pythonExecutable === 'py' ? ['-3', apiScript] : [apiScript]
    return spawn(pythonExecutable, args, {
      cwd: projectRoot,
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  }

  return new BackendSupervisor({
    launch,
    probe: () => probeApiReadiness(port),
    onStatusChange: handleBackendStatusChange,
  })
}

function handleBackendStatusChange(status: BackendStatus) {
  if (status.state === 'ready') {
    console.log(`FastAPI is ready on http://${API_HOST}:${apiPort}.`)
    return
  }
  if (status.state === 'restarting') {
    console.warn(`FastAPI recovery attempt ${status.attempt}: ${status.error ?? ''}`)
    return
  }
  if (status.state === 'failed') {
    console.error(`FastAPI is unavailable: ${status.error ?? 'Unknown error'}`)
    if (BrowserWindow.getAllWindows().length > 0) void promptForBackendRecovery(status.error)
  }
}

async function promptForBackendRecovery(error?: string) {
  if (backendFailurePromptOpen) return
  backendFailurePromptOpen = true
  try {
    const result = await dialog.showMessageBox({
      type: 'error',
      title: 'Calculation backend unavailable',
      message: 'The calculation service could not be started.',
      detail: error ?? 'Check the database connection and backend configuration.',
      buttons: ['Retry', 'Quit'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    })
    if (result.response === 0) {
      try {
        await startApiServer()
      } catch (retryError) {
        const message = retryError instanceof Error ? retryError.message : String(retryError)
        backendFailurePromptOpen = false
        await promptForBackendRecovery(message)
      }
    } else {
      app.quit()
    }
  } finally {
    backendFailurePromptOpen = false
  }
}

async function startApiServer() {
  let existingReady = false
  try {
    existingReady = await probeApiReadiness(DEFAULT_API_PORT)
  } catch {
    // A C300 API with failed dependencies is not safe to reuse.
  }
  if (existingReady) {
    if (process.env.C300_REUSE_EXISTING_API === '1') {
      apiPort = DEFAULT_API_PORT
      configureLocalApiPort(apiPort)
      usingExistingApi = true
      console.log(`Reusing FastAPI on http://${API_HOST}:${apiPort}.`)
      return
    }
  }

  usingExistingApi = false
  if (!backendSupervisor) {
    apiPort = await selectAvailablePort(DEFAULT_API_PORT)
    configureLocalApiPort(apiPort)
    if (apiPort !== DEFAULT_API_PORT) {
      console.warn(
        `Port ${DEFAULT_API_PORT} is occupied; starting managed FastAPI on port ${apiPort}.`,
      )
    }
    backendSupervisor = createBackendSupervisor(apiPort)
  }
  await backendSupervisor.start()
}

app.whenReady().then(async () => {
  try {
    calculationHistoryStore = new CalculationHistoryStore(
      path.join(app.getPath('userData'), 'calculation-history.sqlite3'),
    )
  } catch (error) {
    console.error('Calculation history startup failed:', error)
  }

  registerApiHandlers()
  try {
    await startApiServer()
  } catch (error) {
    await promptForBackendRecovery(error instanceof Error ? error.message : String(error))
    if (!usingExistingApi && backendSupervisor?.status.state !== 'ready') return
  }
  createWindow()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (!usingExistingApi && backendSupervisor?.status.state !== 'ready') {
        try {
          await startApiServer()
        } catch (error) {
          await promptForBackendRecovery(error instanceof Error ? error.message : String(error))
          return
        }
      }
      createWindow()
    }
  })
})

app.on('before-quit', () => {
  void backendSupervisor?.stop()
  calculationHistoryStore?.close()
  calculationHistoryStore = null
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
