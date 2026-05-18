import { contextBridge } from 'electron'
import type { ElectronApi } from '../shared/electron-api'

const electronApi: ElectronApi = {
  platform: process.platform,
  versions: process.versions,
  ping: () => 'pong',
}

contextBridge.exposeInMainWorld('electronAPI', electronApi)
