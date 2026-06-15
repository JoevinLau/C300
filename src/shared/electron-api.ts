import type { CalculateRequest, CalculateResponse } from './calculator-types'

export type { CalculateRequest, CalculateResponse }

export interface ElectronApi {
  platform: NodeJS.Platform
  versions: NodeJS.ProcessVersions
  ping: () => string
  calculateEmissions: (payload: CalculateRequest) => Promise<CalculateResponse>
}
