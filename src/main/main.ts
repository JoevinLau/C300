import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { postCalculate, requestLocalApi } from './api-client'
import {
  API_HOST,
  DEFAULT_API_PORT,
  DesktopBackendRuntime,
  type BackendRuntimeStatus,
} from './backend-runtime'
import { CalculationHistoryStore } from './calculation-history-store'
import { createBackendHandlers } from './backend-ipc'
import { openWindowWhileBackendStarts } from './startup'
import { BACKEND_CHANNELS } from '../shared/backend-capabilities'
import type {
  CalculationHistoryListOptions,
  SaveCalculationHistoryInput,
} from '../shared/calculation-history-types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
let backendRuntime: DesktopBackendRuntime | null = null
let backendFailurePromptOpen = false
let calculationHistoryStore: CalculationHistoryStore | null = null

function getBackendRuntime(): DesktopBackendRuntime {
  if (!backendRuntime) {
    const projectRoot = path.join(__dirname, '..', '..')
    backendRuntime = new DesktopBackendRuntime({
      packaged: app.isPackaged,
      projectRoot,
      resourcesPath: process.resourcesPath,
      userDataDir: app.getPath('userData'),
      reuseExistingApi: process.env.C300_REUSE_EXISTING_API === '1',
      onStatusChange: handleBackendStatusChange,
    })
  }
  return backendRuntime
}

function getCalculationHistoryStore(): CalculationHistoryStore {
  if (!calculationHistoryStore) {
    throw new Error(
      'Calculation history is unavailable. Restart the app or check that its data folder is writable.',
    )
  }
  return calculationHistoryStore
}

function registerApiHandlers() {
  const backendHandlers = createBackendHandlers({
    calculate: postCalculate,
    request: requestLocalApi,
  })
  Object.entries(BACKEND_CHANNELS).forEach(([capability, channel]) => {
    ipcMain.handle(channel, (_event, ...args: unknown[]) => {
      assertBackendReady()
      const handler = backendHandlers[capability as keyof typeof backendHandlers]
      return Reflect.apply(handler, undefined, args)
    })
  })

  ipcMain.handle('calculation-history:save', (_event, input: SaveCalculationHistoryInput) =>
    getCalculationHistoryStore().save(input),
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
  getBackendRuntime().assertReady()
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

function handleBackendStatusChange(status: BackendRuntimeStatus) {
  if (status.state === 'ready') {
    if (status.mode === 'existing') {
      console.log(`Reusing FastAPI on http://${API_HOST}:${status.port}.`)
    } else if (status.port !== DEFAULT_API_PORT) {
      console.warn(
        `Port ${DEFAULT_API_PORT} is occupied; FastAPI is ready on http://${API_HOST}:${status.port}.`,
      )
    } else {
      console.log(`FastAPI is ready on http://${API_HOST}:${status.port}.`)
    }
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
        await getBackendRuntime().start()
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
  await getBackendRuntime().start()
}

function openAppWindow() {
  void openWindowWhileBackendStarts({
    openWindow: createWindow,
    startBackend: startApiServer,
    onBackendFailure: async (error) => {
      await promptForBackendRecovery(error instanceof Error ? error.message : String(error))
    },
  })
}

app.whenReady().then(() => {
  try {
    calculationHistoryStore = new CalculationHistoryStore(
      path.join(app.getPath('userData'), 'calculation-history.sqlite3'),
    )
  } catch (error) {
    console.error('Calculation history startup failed:', error)
  }

  registerApiHandlers()
  openAppWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      openAppWindow()
    }
  })
})

app.on('before-quit', () => {
  void backendRuntime?.stop()
  calculationHistoryStore?.close()
  calculationHistoryStore = null
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
