import assert from 'node:assert/strict'
import test from 'node:test'

import { openWindowWhileBackendStarts } from './startup.ts'


test('opens the desktop window before waiting for backend readiness', async () => {
  const events: string[] = []
  let releaseBackend!: () => void
  const backendReady = new Promise<void>((resolve) => {
    releaseBackend = resolve
  })

  const startup = openWindowWhileBackendStarts({
    openWindow: () => events.push('window-opened'),
    startBackend: async () => {
      events.push('backend-started')
      await backendReady
    },
    onBackendFailure: async () => {
      events.push('backend-failed')
    },
  })

  assert.deepEqual(events, ['window-opened', 'backend-started'])
  releaseBackend()
  await startup
})
