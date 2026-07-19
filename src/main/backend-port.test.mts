import assert from 'node:assert/strict'
import { once } from 'node:events'
import net, { type AddressInfo } from 'node:net'
import test from 'node:test'

import { selectAvailablePort } from './backend-port.ts'

async function close(server: net.Server) {
  server.close()
  await once(server, 'close')
}

test('selects another loopback port when the preferred port is occupied', async () => {
  const blocker = net.createServer()
  blocker.listen(0, '127.0.0.1')
  await once(blocker, 'listening')
  const occupiedPort = (blocker.address() as AddressInfo).port

  try {
    const selectedPort = await selectAvailablePort(occupiedPort)
    assert.notEqual(selectedPort, occupiedPort)

    const verificationServer = net.createServer()
    verificationServer.listen(selectedPort, '127.0.0.1')
    await once(verificationServer, 'listening')
    await close(verificationServer)
  } finally {
    await close(blocker)
  }
})
