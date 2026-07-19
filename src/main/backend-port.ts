import net, { type AddressInfo } from 'node:net'

const API_HOST = '127.0.0.1'

function claimAndReleasePort(port: number): Promise<number | null> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()
    server.once('error', () => resolve(null))
    server.once('listening', () => {
      const address = server.address() as AddressInfo
      server.close(() => resolve(address.port))
    })
    server.listen({ host: API_HOST, port, exclusive: true })
  })
}

export async function selectAvailablePort(preferredPort: number): Promise<number> {
  const preferred = await claimAndReleasePort(preferredPort)
  if (preferred !== null) return preferred

  const fallback = await claimAndReleasePort(0)
  if (fallback === null) {
    throw new Error('No loopback port is available for the calculation backend.')
  }
  return fallback
}
