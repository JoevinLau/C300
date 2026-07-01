import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs'

import { postCalculate } from './api-client'
import type { CalculateRequest } from '../shared/calculator-types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
let apiProcess: ChildProcessWithoutNullStreams | null = null

function registerApiHandlers() {
  ipcMain.handle('calculator:calculate', async (_event, payload: CalculateRequest) => {
    return postCalculate(payload)
  })
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

function resolvePythonExecutable(venvPythons: string[]) {
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

  return process.platform === 'win32' ? 'python' : 'python3'
}

function startApiServer() {
  const projectRoot = path.join(__dirname, '..', '..')
  const apiScript = path.join(projectRoot, 'api', 'main.py')
  const ragDataDir = path.join(app.getPath('userData'), 'rag-data')
  const venvPython = path.join(
    projectRoot,
    'api',
    'venv',
    process.platform === 'win32' ? 'Scripts' : 'bin',
    process.platform === 'win32' ? 'python.exe' : 'python',
  )
  const rootVenvPython = path.join(
    projectRoot,
    '.venv',
    process.platform === 'win32' ? 'Scripts' : 'bin',
    process.platform === 'win32' ? 'python.exe' : 'python',
  )
  const pythonExecutable = resolvePythonExecutable([venvPython, rootVenvPython])

  apiProcess = spawn(pythonExecutable, [apiScript], {
    cwd: projectRoot,
    env: {
      ...process.env,
      RAG_DATA_DIR: ragDataDir,
    },
    windowsHide: true,
    stdio: 'pipe',
  })

  apiProcess.on('exit', () => {
    apiProcess = null
  })
}

app.whenReady().then(() => {
  registerApiHandlers()
  startApiServer()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (apiProcess) {
    apiProcess.kill()
    apiProcess = null
  }

  if (process.platform !== 'darwin') {
    app.quit()
  }
})
