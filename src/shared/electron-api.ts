import type { BackendCapabilities } from './backend-capabilities'
import type {
  CalculationHistoryDetail,
  CalculationHistoryListOptions,
  CalculationHistorySummary,
  SaveCalculationHistoryInput,
} from './calculation-history-types'

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

export interface ElectronApi {
  app: {
    platform: NodeJS.Platform
    versions: NodeJS.ProcessVersions
  }
  backend: BackendCapabilities
  history: {
    save(input: SaveCalculationHistoryInput): Promise<CalculationHistoryDetail>
    list(options?: CalculationHistoryListOptions): Promise<CalculationHistorySummary[]>
    get(id: string): Promise<CalculationHistoryDetail | null>
  }
}
