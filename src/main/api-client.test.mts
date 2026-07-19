import assert from 'node:assert/strict'
import test from 'node:test'

import { configureLocalApiPort, requestLocalApi } from './api-client.ts'


test('allows known backend routes and rejects arbitrary URLs', async () => {
  const originalFetch = globalThis.fetch
  const requests: Array<{ url: string; init?: RequestInit }> = []
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init })
    return new Response(JSON.stringify({ machines: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const result = await requestLocalApi({ path: '/method2/machines' })
    assert.deepEqual(result, { machines: [] })
    assert.equal(requests[0]?.url, 'http://127.0.0.1:8000/method2/machines')

    await assert.rejects(
      requestLocalApi({ path: 'https://example.com/steal-data' }),
      /route is not allowed/,
    )
    await assert.rejects(
      requestLocalApi({ path: '/unapproved', method: 'POST', json: {} }),
      /route is not allowed/,
    )
    assert.equal(requests.length, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('reconstructs multipart document uploads from IPC-safe bytes', async () => {
  const originalFetch = globalThis.fetch
  let submittedForm: FormData | null = null
  globalThis.fetch = async (_input, init) => {
    submittedForm = init?.body as FormData
    return new Response(JSON.stringify({ documents: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    await requestLocalApi({
      path: '/rag/documents',
      method: 'POST',
      fields: { workspace_id: 'workspace-a' },
      files: [
        {
          fieldName: 'files',
          name: 'supplier.txt',
          contentType: 'text/plain',
          bytes: new TextEncoder().encode('supplier evidence'),
        },
      ],
    })

    assert.ok(submittedForm instanceof FormData)
    assert.equal(submittedForm.get('workspace_id'), 'workspace-a')
    const uploaded = submittedForm.get('files')
    assert.ok(uploaded instanceof File)
    assert.equal(uploaded.name, 'supplier.txt')
    assert.equal(await uploaded.text(), 'supplier evidence')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('aborts a stalled backend request after the configured deadline', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener(
        'abort',
        () => reject(init.signal?.reason ?? new DOMException('Aborted', 'AbortError')),
        { once: true },
      )
    })

  try {
    await assert.rejects(
      Promise.race([
        requestLocalApi({ path: '/method2/machines' }, { timeoutMs: 20 }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('test guard expired')), 150),
        ),
      ]),
      /Local API request timed out after 20 ms/,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('targets the managed backend port selected at startup', async () => {
  const originalFetch = globalThis.fetch
  let requestedUrl = ''
  globalThis.fetch = async (input) => {
    requestedUrl = String(input)
    return new Response(JSON.stringify({ machines: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    configureLocalApiPort(43123)
    await requestLocalApi({ path: '/method2/machines' })
    assert.equal(requestedUrl, 'http://127.0.0.1:43123/method2/machines')
  } finally {
    configureLocalApiPort(8000)
    globalThis.fetch = originalFetch
  }
})
