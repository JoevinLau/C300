import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronApi, LocalApiRequest } from '../shared/electron-api'
import type { CalculateRequest } from '../shared/calculator-types'
import type {
  CalculationHistoryListOptions,
  SaveCalculationHistoryInput,
} from '../shared/calculation-history-types'

const electronApi: ElectronApi = {
  platform: process.platform,
  versions: process.versions,
  ping: () => 'pong',
  calculateEmissions: (payload: CalculateRequest) =>
    ipcRenderer.invoke('calculator:calculate', payload),
  requestLocalApi: (request: LocalApiRequest) =>
    ipcRenderer.invoke('local-api:request', request),
  saveCalculationHistory: (input: SaveCalculationHistoryInput) =>
    ipcRenderer.invoke('calculation-history:save', input),
  listCalculationHistory: (options?: CalculationHistoryListOptions) =>
    ipcRenderer.invoke('calculation-history:list', options),
  getCalculationHistory: (id: string) =>
    ipcRenderer.invoke('calculation-history:get', id),
}

contextBridge.exposeInMainWorld('electronAPI', electronApi)
