import assert from 'node:assert/strict'
import test from 'node:test'

import { openWindowWhileBackendStarts } from './startup.ts'

test('opens the desktop window without waiting for backend readiness', async () => {
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
      return true
    },
  })

  assert.deepEqual(events, ['window-opened', 'backend-started'])
  releaseBackend()
  await startup
  assert.deepEqual(events, ['window-opened', 'backend-started'])
})

test('keeps the window open while backend recovery runs', async () => {
  const events: string[] = []

  await openWindowWhileBackendStarts({
    openWindow: () => events.push('window-opened'),
    startBackend: async () => {
      events.push('backend-started')
      throw new Error('startup failed')
    },
    onBackendFailure: async () => {
      events.push('backend-recovered')
      return true
    },
  })

  assert.deepEqual(events, ['window-opened', 'backend-started', 'backend-recovered'])
})

test('does not delay the window when backend recovery is cancelled', async () => {
  const events: string[] = []

  await openWindowWhileBackendStarts({
    openWindow: () => events.push('window-opened'),
    startBackend: async () => {
      events.push('backend-started')
      throw new Error('startup failed')
    },
    onBackendFailure: async () => {
      events.push('backend-cancelled')
      return false
    },
  })

  assert.deepEqual(events, ['window-opened', 'backend-started', 'backend-cancelled'])
})
