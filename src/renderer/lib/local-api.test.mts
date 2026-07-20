import assert from 'node:assert/strict'
import test from 'node:test'

import { requestLocalApi } from './local-api.ts'


test('uses HTTP for the browser development fallback', async () => {
  const requestedUrls: string[] = []
  const originalWindow = globalThis.window
  const originalFetch = globalThis.fetch

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {},
  })
  globalThis.fetch = async (input) => {
    requestedUrls.push(String(input))
    return new Response(JSON.stringify({ machines: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const result = await requestLocalApi({ path: '/method2/machines' })
    assert.deepEqual(result, { machines: [] })
    assert.deepEqual(requestedUrls, ['http://127.0.0.1:8000/method2/machines'])
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    })
    globalThis.fetch = originalFetch
  }
})
