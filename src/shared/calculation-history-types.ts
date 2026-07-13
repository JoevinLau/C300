import type {
  CalculateRequest,
  CalculateResponse,
  EcoTransitResponse,
  Method2CalculateRequest,
  Method2CalculateResponse,
} from './calculator-types'

export type CalculationHistoryMethod = 'useeio' | 'method2'

export type CalculationHistoryTransport = Omit<EcoTransitResponse['transport'], 'raw'>

export interface CalculationHistoryListOptions {
  limit?: number
  offset?: number
  method?: CalculationHistoryMethod
}

export interface CalculationHistorySummary {
  readonly id: string
  readonly method: CalculationHistoryMethod
  readonly documentId: string
  readonly year: number
  readonly totalEmissionsKgCo2e: number
  readonly totalAmountSgd: number
  readonly createdAt: string
}

export interface SaveUseeioCalculationHistoryInput {
  method: 'useeio'
  request: CalculateRequest
  result: CalculateResponse
  transport?: CalculationHistoryTransport | null
}

export interface SaveMethod2CalculationHistoryInput {
  method: 'method2'
  request: Method2CalculateRequest
  result: Method2CalculateResponse
  transport?: CalculationHistoryTransport | null
}

export type SaveCalculationHistoryInput =
  | SaveUseeioCalculationHistoryInput
  | SaveMethod2CalculationHistoryInput

export interface UseeioCalculationHistoryDetail extends CalculationHistorySummary {
  readonly method: 'useeio'
  readonly request: CalculateRequest
  readonly result: CalculateResponse
  readonly transport: CalculationHistoryTransport | null
}

export interface Method2CalculationHistoryDetail extends CalculationHistorySummary {
  readonly method: 'method2'
  readonly request: Method2CalculateRequest
  readonly result: Method2CalculateResponse
  readonly transport: CalculationHistoryTransport | null
}

export type CalculationHistoryDetail =
  | UseeioCalculationHistoryDetail
  | Method2CalculationHistoryDetail
