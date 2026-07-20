import type {
  BatchCalculationRequestRow,
  BatchCalculationResult,
  CalculateRequest,
  CalculateResponse,
  EcoTransitRequest,
  EcoTransitResponse,
  Method2CalculateRequest,
  Method2CalculateResponse,
  Method2MachineReference,
  NaicsOption,
} from './calculator-types'

export const BACKEND_CHANNELS = {
  calculateUseeio: 'backend:calculate-useeio',
  calculateTransport: 'backend:calculate-transport',
  listMethod2Machines: 'backend:list-method2-machines',
  calculateMethod2: 'backend:calculate-method2',
  listNaicsOptions: 'backend:list-naics-options',
  searchNaics: 'backend:search-naics',
  suggestNaics: 'backend:suggest-naics',
  getNaicsFactor: 'backend:get-naics-factor',
  confirmNaics: 'backend:confirm-naics',
  calculateBatch: 'backend:calculate-batch',
  listDocuments: 'backend:list-documents',
  uploadDocuments: 'backend:upload-documents',
  deleteDocument: 'backend:delete-document',
  sendMethod2Chat: 'backend:send-method2-chat',
} as const satisfies Record<keyof BackendCapabilities, string>

export interface NaicsMatch {
  code: string
  description: string
  kgco2e_per_usd?: number
  category?: string | null
  confidence?: string
}

export interface NaicsSearchResult {
  tier: number
  material_token: string
  matches: NaicsMatch[]
}

export interface NaicsSuggestion extends Partial<NaicsOption> {
  suggested_naics?: string
  material_token?: string
  source?: string
}

export interface NaicsConfirmation {
  material_token: string
  mapping: NaicsOption
}

export interface Method2Document {
  document_id: string
  filename: string
  file_type: string
  content_hash: string
  chunk_count: number
  status: string
  error: string | null
}

export interface UploadDocumentFile {
  name: string
  contentType: string
  bytes: Uint8Array
}

export interface Method2Citation {
  document_id: string
  filename: string
  location: string
  excerpt: string
  score: number
}

export interface Method2ChatRequest {
  workspace_id: string
  message: string
  calculation_context: Record<string, unknown>
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
}

export interface Method2ChatResponse {
  reply: string
  citations: Method2Citation[]
  grounded: boolean
}

export interface BackendCapabilities {
  calculateUseeio(payload: CalculateRequest): Promise<CalculateResponse>
  calculateTransport(payload: EcoTransitRequest): Promise<EcoTransitResponse>
  listMethod2Machines(): Promise<{ machines: Method2MachineReference[] }>
  calculateMethod2(payload: Method2CalculateRequest): Promise<Method2CalculateResponse>
  listNaicsOptions(): Promise<NaicsOption[]>
  searchNaics(materialName: string): Promise<NaicsSearchResult>
  suggestNaics(materialName: string): Promise<NaicsSuggestion>
  getNaicsFactor(code: string): Promise<NaicsOption>
  confirmNaics(materialName: string, naicsCode: string): Promise<NaicsConfirmation>
  calculateBatch(rows: BatchCalculationRequestRow[]): Promise<BatchCalculationResult[]>
  listDocuments(workspaceId: string): Promise<Method2Document[]>
  uploadDocuments(
    workspaceId: string,
    files: UploadDocumentFile[],
  ): Promise<{ documents: Method2Document[] }>
  deleteDocument(workspaceId: string, documentId: string): Promise<null>
  sendMethod2Chat(request: Method2ChatRequest): Promise<Method2ChatResponse>
}
