export function createMethod2WorkspaceId(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error('Secure random workspace IDs are unavailable in this runtime.')
  }
  return `method2-${globalThis.crypto.randomUUID()}`
}
