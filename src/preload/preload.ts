import { contextBridge, ipcRenderer } from 'electron'
import { BACKEND_CHANNELS } from '../shared/backend-capabilities'
import type { ElectronApi } from '../shared/electron-api'
import type {
  CalculationHistoryListOptions,
  SaveCalculationHistoryInput,
} from '../shared/calculation-history-types'

const electronApi: ElectronApi = {
  app: {
    platform: process.platform,
    versions: process.versions,
  },
  backend: {
    calculateUseeio: (payload) =>
      ipcRenderer.invoke(BACKEND_CHANNELS.calculateUseeio, payload),
    calculateTransport: (payload) =>
      ipcRenderer.invoke(BACKEND_CHANNELS.calculateTransport, payload),
    listMethod2Machines: () => ipcRenderer.invoke(BACKEND_CHANNELS.listMethod2Machines),
    calculateMethod2: (payload) =>
      ipcRenderer.invoke(BACKEND_CHANNELS.calculateMethod2, payload),
    listNaicsOptions: () => ipcRenderer.invoke(BACKEND_CHANNELS.listNaicsOptions),
    searchNaics: (materialName) =>
      ipcRenderer.invoke(BACKEND_CHANNELS.searchNaics, materialName),
    suggestNaics: (materialName) =>
      ipcRenderer.invoke(BACKEND_CHANNELS.suggestNaics, materialName),
    getNaicsFactor: (code) =>
      ipcRenderer.invoke(BACKEND_CHANNELS.getNaicsFactor, code),
    confirmNaics: (materialName, naicsCode) =>
      ipcRenderer.invoke(BACKEND_CHANNELS.confirmNaics, materialName, naicsCode),
    calculateBatch: (rows) =>
      ipcRenderer.invoke(BACKEND_CHANNELS.calculateBatch, rows),
    listDocuments: (workspaceId) =>
      ipcRenderer.invoke(BACKEND_CHANNELS.listDocuments, workspaceId),
    uploadDocuments: (workspaceId, files) =>
      ipcRenderer.invoke(BACKEND_CHANNELS.uploadDocuments, workspaceId, files),
    deleteDocument: (workspaceId, documentId) =>
      ipcRenderer.invoke(BACKEND_CHANNELS.deleteDocument, workspaceId, documentId),
    sendMethod2Chat: (request) =>
      ipcRenderer.invoke(BACKEND_CHANNELS.sendMethod2Chat, request),
  },
  history: {
    save: (input: SaveCalculationHistoryInput) =>
      ipcRenderer.invoke('calculation-history:save', input),
    list: (options?: CalculationHistoryListOptions) =>
      ipcRenderer.invoke('calculation-history:list', options),
    get: (id: string) => ipcRenderer.invoke('calculation-history:get', id),
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronApi)
