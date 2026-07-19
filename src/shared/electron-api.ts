import type { CalculateRequest, CalculateResponse } from './calculator-types'
import type {
  CalculationHistoryDetail,
  CalculationHistoryListOptions,
  CalculationHistorySummary,
  SaveCalculationHistoryInput,
} from './calculation-history-types'

export type { CalculateRequest, CalculateResponse }
export type {
  CalculationHistoryDetail,
  CalculationHistoryListOptions,
  CalculationHistoryMethod,
  CalculationHistorySummary,
  CalculationHistoryTransport,
  Method2CalculationHistoryDetail,
  SaveCalculationHistoryInput,
  SaveMethod2CalculationHistoryInput,
  SaveUseeioCalculationHistoryInput,
  UseeioCalculationHistoryDetail,
} from './calculation-history-types'

export type LocalApiMethod = 'GET' | 'POST' | 'DELETE'

export interface LocalApiFile {
  fieldName: string
  name: string
  contentType: string
  bytes: Uint8Array
}

export interface LocalApiRequest {
  path: string
  method?: LocalApiMethod
  json?: unknown
  fields?: Record<string, string>
  files?: LocalApiFile[]
}

export interface ElectronApi {
  platform: NodeJS.Platform
  versions: NodeJS.ProcessVersions
  ping: () => string
  calculateEmissions: (payload: CalculateRequest) => Promise<CalculateResponse>
  requestLocalApi: (request: LocalApiRequest) => Promise<unknown>
  saveCalculationHistory: (
    input: SaveCalculationHistoryInput,
  ) => Promise<CalculationHistoryDetail>
  listCalculationHistory: (
    options?: CalculationHistoryListOptions,
  ) => Promise<CalculationHistorySummary[]>
  getCalculationHistory: (id: string) => Promise<CalculationHistoryDetail | null>
}
