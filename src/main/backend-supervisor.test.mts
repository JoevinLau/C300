import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import test from 'node:test'

import { appendBoundedLog, BackendSupervisor } from './backend-supervisor.ts'

class FakeChild extends EventEmitter {
  stderr = new PassThrough()
  killed = false

  kill() {
    this.killed = true
    this.emit('exit', null, 'SIGTERM')
    return true
  }
}

const delay = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

async function waitFor(predicate: () => boolean, timeoutMs = 250) {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('condition was not reached')
    await delay(2)
  }
}

test('does not report ready until the health probe succeeds', async () => {
  const child = new FakeChild()
  let healthy = false
  const supervisor = new BackendSupervisor({
    launch: () => child,
    probe: async () => healthy,
    startupTimeoutMs: 200,
    probeIntervalMs: 2,
    restartDelaysMs: [0],
  })

  let started = false
  const start = supervisor.start().then(() => {
    started = true
  })
  await delay(10)
  assert.equal(started, false)
  assert.equal(supervisor.status.state, 'starting')

  healthy = true
  await start
  assert.equal(supervisor.status.state, 'ready')
  await supervisor.stop()
})

test('restarts a backend that exits after becoming ready', async () => {
  const children: FakeChild[] = []
  const supervisor = new BackendSupervisor({
    launch: () => {
      const child = new FakeChild()
      children.push(child)
      return child
    },
    probe: async () => children.length >= 2 || children[0]?.killed === false,
    startupTimeoutMs: 100,
    probeIntervalMs: 2,
    restartDelaysMs: [0, 2],
  })

  await supervisor.start()
  children[0].emit('exit', 1, null)

  await waitFor(() => children.length === 2 && supervisor.status.state === 'ready')
  assert.equal(children.length, 2)
  await supervisor.stop()
})

test('fails startup and kills the child when readiness never arrives', async () => {
  const child = new FakeChild()
  const supervisor = new BackendSupervisor({
    launch: () => child,
    probe: async () => false,
    startupTimeoutMs: 20,
    probeIntervalMs: 2,
    restartDelaysMs: [0],
  })

  await assert.rejects(supervisor.start(), /did not become ready within 20 ms/)
  assert.equal(child.killed, true)
  assert.equal(supervisor.status.state, 'failed')
})

test('keeps only the bounded tail of backend stderr', () => {
  assert.equal(appendBoundedLog('12345', '67890', 6), '567890')
})

test('joins an in-flight recovery instead of launching a competing process', async () => {
  const children: FakeChild[] = []
  const supervisor = new BackendSupervisor({
    launch: () => {
      const child = new FakeChild()
      children.push(child)
      return child
    },
    probe: async () => true,
    startupTimeoutMs: 100,
    probeIntervalMs: 2,
    restartDelaysMs: [0],
  })

  await supervisor.start()
  children[0].emit('exit', 1, null)
  await supervisor.start()

  assert.equal(children.length, 2)
  assert.equal(supervisor.status.state, 'ready')
  await supervisor.stop()
})
