import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'

import { postCalculate } from './api-client'
import type { CalculateRequest } from '../shared/calculator-types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
let apiProcess: ChildProcess | null = null

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
  const playwrightBrowsersDir = path.join(projectRoot, '.playwright-browsers')
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

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: undefined,
    PLAYWRIGHT_BROWSERS_PATH: playwrightBrowsersDir,
    RAG_DATA_DIR: ragDataDir,
  }

  const launch = (index: number) => {
    const pythonExecutable = candidates[index]
    if (!pythonExecutable) {
      console.error('FastAPI startup failed: no usable Python executable was found.')
      return
    }
    if (path.isAbsolute(pythonExecutable) && !fs.existsSync(pythonExecutable)) {
      launch(index + 1)
      return
    }

    const args = pythonExecutable === 'py' ? ['-3', apiScript] : [apiScript]
    const child = spawn(pythonExecutable, args, {
      cwd: projectRoot,
      env,
      windowsHide: true,
      stdio: 'pipe',
    })

    apiProcess = child
    let stderr = ''
    let settled = false
    const settleTimer = setTimeout(() => {
      settled = true
    }, 3000)

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      clearTimeout(settleTimer)
      console.error(`FastAPI startup failed with ${pythonExecutable}: ${error.message}`)
      if (!settled) launch(index + 1)
    })
    child.on('exit', (code) => {
      clearTimeout(settleTimer)
      if (apiProcess === child) apiProcess = null
      if (!settled) {
        console.error(
          `FastAPI exited during startup with ${pythonExecutable} (code ${code}). ${stderr.trim()}`,
        )
        launch(index + 1)
      }
    })
  }

  launch(0)
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
