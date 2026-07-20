import assert from 'node:assert/strict'
import test from 'node:test'

import { createBackendHandlers } from './backend-ipc.ts'

test('maps named capabilities to fixed backend routes', async () => {
  const requests: unknown[] = []
  const handlers = createBackendHandlers({
    calculate: async (payload) => payload as never,
    request: async (request) => {
      requests.push(request)
      return null as never
    },
  })

  await handlers.searchNaics('steel & alloy')
  await handlers.deleteDocument('workspace/a', 'document?b')
  await handlers.confirmNaics('steel', '331110')

  assert.deepEqual(requests, [
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
    'calculateTransport',
    'calculateUseeio',
    'confirmNaics',
    'deleteDocument',
    'getNaicsFactor',
    'listDocuments',
    'listMethod2Machines',
    'listNaicsOptions',
    'searchNaics',
    'sendMethod2Chat',
    'suggestNaics',
    'uploadDocuments',
  ])
})
