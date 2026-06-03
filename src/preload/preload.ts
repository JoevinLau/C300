import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronApi } from '../shared/electron-api'
import type { CalculateRequest } from '../shared/calculator-types'

const electronApi: ElectronApi = {
  platform: process.platform,
  versions: process.versions,
  ping: () => 'pong',
  calculateEmissions: (payload: CalculateRequest) =>
    ipcRenderer.invoke('calculator:calculate', payload),
}

contextBridge.exposeInMainWorld('electronAPI', electronApi)
