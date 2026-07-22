import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DesktopBackendRuntime,
  resolvePythonCommand,
  type BackendRuntimeStatus,
} from './backend-runtime.ts'
import type { BackendStatus } from './backend-supervisor.ts'

class FakeSupervisor {
  status: BackendStatus = { state: 'stopped', attempt: 0 }
  starts = 0
  stops = 0
  private readonly onStatusChange: (status: BackendStatus) => void

  constructor(onStatusChange: (status: BackendStatus) => void) {
    this.onStatusChange = onStatusChange
  }

  async start() {
    this.starts += 1
    this.status = { state: 'ready', attempt: 1 }
    this.onStatusChange(this.status)
  }

  async stop() {
    this.stops += 1
    this.status = { state: 'stopped', attempt: 0 }
    this.onStatusChange(this.status)
  }
}

function runtimeOptions(overrides: {
  probe?: (port: number) => Promise<boolean>
  reuseExistingApi?: boolean
  selectPort?: (port: number) => Promise<number>
} = {}) {
  const configuredPorts: number[] = []
  const statuses: BackendRuntimeStatus[] = []
  let supervisor: FakeSupervisor | null = null
  const options = {
    packaged: false,
    projectRoot: '/project',
    resourcesPath: '/resources',
    userDataDir: '/data',
    reuseExistingApi: overrides.reuseExistingApi,
    onStatusChange: (status: BackendRuntimeStatus) => statuses.push(status),
    dependencies: {
      configurePort: (port: number) => configuredPorts.push(port),
      createSupervisor: (_port: number, onStatusChange: (status: BackendStatus) => void) => {
        supervisor = new FakeSupervisor(onStatusChange)
        return supervisor
      },
      probe: overrides.probe ?? (async () => false),
      selectPort: overrides.selectPort ?? (async (port: number) => port),
    },
  }
  return { configuredPorts, options, statuses, getSupervisor: () => supervisor }
}

test('owns port selection, API configuration, readiness, and shutdown', async () => {
  const fixture = runtimeOptions({ selectPort: async () => 43123 })
  const runtime = new DesktopBackendRuntime(fixture.options)

  await runtime.start()

  assert.equal(runtime.port, 43123)
  assert.equal(runtime.status.state, 'ready')
  assert.equal(runtime.status.mode, 'managed')
  assert.deepEqual(fixture.configuredPorts, [43123])
  assert.equal(fixture.getSupervisor()?.starts, 1)
  assert.doesNotThrow(() => runtime.assertReady())

  await runtime.stop()
  assert.equal(fixture.getSupervisor()?.stops, 1)
  assert.equal(runtime.status.state, 'stopped')
})

test('reuses an existing healthy API only when explicitly enabled', async () => {
  const fixture = runtimeOptions({ probe: async () => true, reuseExistingApi: true })
  const runtime = new DesktopBackendRuntime(fixture.options)

  await runtime.start()

  assert.equal(runtime.status.mode, 'existing')
  assert.equal(runtime.status.state, 'ready')
  assert.deepEqual(fixture.configuredPorts, [8000])
  assert.equal(fixture.getSupervisor(), null)
})

test('does not attach to an existing API without explicit consent', async () => {
  const fixture = runtimeOptions({
    probe: async () => true,
    reuseExistingApi: false,
    selectPort: async () => 43124,
  })
  const runtime = new DesktopBackendRuntime(fixture.options)

  await runtime.start()

  assert.equal(runtime.status.mode, 'managed')
  assert.equal(runtime.port, 43124)
  assert.equal(fixture.getSupervisor()?.starts, 1)
})

test('starts one managed backend when concurrent callers request startup', async () => {
  let releasePort!: (port: number) => void
  const selectedPort = new Promise<number>((resolve) => {
    releasePort = resolve
  })
  const fixture = runtimeOptions({ selectPort: () => selectedPort })
  const runtime = new DesktopBackendRuntime(fixture.options)

  const first = runtime.start()
  const second = runtime.start()
  releasePort(43123)
  await Promise.all([first, second])

  assert.equal(fixture.getSupervisor()?.starts, 1)
})

test('waits for an in-flight backend startup before serving a capability', async () => {
  let releasePort!: (port: number) => void
  const selectedPort = new Promise<number>((resolve) => {
    releasePort = resolve
  })
  const fixture = runtimeOptions({ selectPort: () => selectedPort })
  const runtime = new DesktopBackendRuntime(fixture.options)

  const startup = runtime.start()
  const capabilityReady = runtime.waitUntilReady()

  releasePort(43123)
  await Promise.all([startup, capabilityReady])

  assert.equal(runtime.status.state, 'ready')
  assert.equal(fixture.getSupervisor()?.starts, 1)
})

test('reports a clear error while the managed backend is unavailable', () => {
  const fixture = runtimeOptions()
  const runtime = new DesktopBackendRuntime(fixture.options)

  assert.throws(() => runtime.assertReady(), /backend is stopped/)
})

test('resolves Python commands with their required prefix arguments', () => {
  const checked: string[] = []
  const command = resolvePythonCommand(
    [
      { command: '/missing/python', prefixArgs: [] },
      { command: 'py', prefixArgs: ['-3'] },
    ],
    {
      fileExists: () => false,
      canRun: (candidate) => {
        checked.push([candidate.command, ...candidate.prefixArgs].join(' '))
        return candidate.command === 'py'
      },
    },
  )

  assert.deepEqual(command, { command: 'py', prefixArgs: ['-3'] })
  assert.deepEqual(checked, ['py -3'])
})
