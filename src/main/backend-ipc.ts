import type { BackendCapabilities } from '../shared/backend-capabilities'
import type { CalculateRequest, CalculateResponse } from '../shared/calculator-types'
import type { LocalApiRequest } from '../shared/local-api-types'

export type BackendHandlerMap = {
  [Key in keyof BackendCapabilities]: BackendCapabilities[Key]
}

export interface BackendHandlerDependencies {
  calculate(payload: CalculateRequest): Promise<CalculateResponse>
  request<T>(request: LocalApiRequest): Promise<T>
}

export function createBackendHandlers({
  calculate,
  request,
}: BackendHandlerDependencies): BackendHandlerMap {
  return {
    calculateUseeio: calculate,
    calculateTransport: (payload) =>
      request({ path: '/ecotransit', method: 'POST', json: payload }),
    listMethod2Machines: () => request({ path: '/method2/machines' }),
    calculateMethod2: (payload) =>
      request({ path: '/method2/calculate', method: 'POST', json: payload }),
    listNaicsOptions: () => request({ path: '/naics' }),
    searchNaics: (materialName) =>
      request({ path: `/api/naics/search?q=${encodeURIComponent(materialName)}` }),
    suggestNaics: (materialName) =>
      request({
        path: `/api/naics/llm-suggest?material=${encodeURIComponent(materialName)}`,
      }),
    getNaicsFactor: (code) =>
      request({ path: `/api/naics/factor/${encodeURIComponent(code)}` }),
    confirmNaics: (materialName, naicsCode) =>
      request({
        path: '/api/naics/confirm',
        method: 'POST',
        json: {
          material_token: materialName,
          mapped_naics: naicsCode,
          user_id: 'default',
        },
      }),
    calculateBatch: (rows) =>
      request({ path: '/api/calculate/batch', method: 'POST', json: rows }),
    listDocuments: (workspaceId) =>
      request({
        path: `/rag/documents?workspace_id=${encodeURIComponent(workspaceId)}`,
      }),
    uploadDocuments: (workspaceId, files) =>
      request({
        path: '/rag/documents',
        method: 'POST',
        fields: { workspace_id: workspaceId },
        files: files.map((file) => ({ ...file, fieldName: 'files' })),
      }),
    deleteDocument: (workspaceId, documentId) =>
      request({
        path: `/rag/documents/${encodeURIComponent(documentId)}?workspace_id=${encodeURIComponent(workspaceId)}`,
        method: 'DELETE',
      }),
    sendMethod2Chat: (chatRequest) =>
      request({ path: '/method2-chat', method: 'POST', json: chatRequest }),
    listMethod3ReferenceData: () => request({ path: '/method3/reference-data' }),
    getMethod3Basis: (basisRequest) => {
      const query = new URLSearchParams({
        purchase_year: String(basisRequest.purchase_year),
        purchase_month: String(basisRequest.purchase_month),
        purchase_type: basisRequest.purchase_type,
        country_code: basisRequest.country_code,
        sector_code: basisRequest.sector_code,
      })
      return request({ path: `/method3/basis?${query.toString()}` })
    },
    calculateMethod3: (method3Request) =>
      request({ path: '/method3/calculate', method: 'POST', json: method3Request }),
  }
}
