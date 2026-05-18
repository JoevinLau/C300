export interface ElectronApi {
  platform: NodeJS.Platform
  versions: NodeJS.ProcessVersions
  ping: () => string
}
