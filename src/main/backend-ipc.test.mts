import assert from 'node:assert/strict'
import test from 'node:test'

import { createBackendHandlers } from './backend-ipc.ts'

test('maps named capabilities to fixed backend routes', async () => {
  const requests: unknown[] = []
  const options: unknown[] = []
  const handlers = createBackendHandlers({
    calculate: async (payload) => payload as never,
    request: async (request, requestOptions) => {
      requests.push(request)
      options.push(requestOptions)
      return null as never
    },
  })

  await handlers.calculateTransport({
    origin_country: 'South Korea',
    port_of_loading: 'Port of Busan',
    port_of_discharge: 'Singapore',
    weight_kg: 100,
    transport_mode: 'sea',
  })
  await handlers.searchNaics('steel & alloy')
  await handlers.deleteDocument('workspace/a', 'document?b')
  await handlers.confirmNaics('steel', '331110')
  await handlers.getMethod3Basis({
    purchase_year: 2026,
    purchase_month: 5,
    purchase_type: 'imported_raw_material',
    country_code: 'CHN',
    sector_code: '331313',
  })

  assert.deepEqual(requests, [
    {
      path: '/ecotransit',
      method: 'POST',
      json: {
        origin_country: 'South Korea',
        port_of_loading: 'Port of Busan',
        port_of_discharge: 'Singapore',
        weight_kg: 100,
        transport_mode: 'sea',
      },
    },
    { path: '/api/naics/search?q=steel%20%26%20alloy' },
    {
      path: '/rag/documents/document%3Fb?workspace_id=workspace%2Fa',
      method: 'DELETE',
    },
    {
      path: '/api/naics/confirm',
      method: 'POST',
      json: {
        material_token: 'steel',
        mapped_naics: '331110',
        user_id: 'default',
      },
    },
    {
      path: '/method3/basis?purchase_year=2026&purchase_month=5&purchase_type=imported_raw_material&country_code=CHN&sector_code=331313',
    },
  ])
  assert.deepEqual(options, [
    { timeoutMs: 180_000 },
    undefined,
    undefined,
    undefined,
    undefined,
  ])
})

test('exposes every backend operation as a named handler', () => {
  const handlers = createBackendHandlers({
    calculate: async (payload) => payload as never,
    request: async () => null as never,
  })

  assert.deepEqual(Object.keys(handlers).sort(), [
    'calculateBatch',
    'calculateMethod2',
    'calculateMethod3',
    'calculateTransport',
    'calculateUseeio',
    'confirmNaics',
    'deleteDocument',
    'getMethod3Basis',
    'getNaicsFactor',
    'listDocuments',
    'listMethod2Machines',
    'listMethod3ReferenceData',
    'listNaicsOptions',
    'searchNaics',
    'sendMethod2Chat',
    'suggestNaics',
    'uploadDocuments',
  ])
})
