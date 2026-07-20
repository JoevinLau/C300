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
