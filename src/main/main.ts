import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
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
  const pythonExecutable = fs.existsSync(venvPython)
    ? venvPython
    : process.platform === 'win32'
      ? 'python'
      : 'python3'

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
