import type {
  CalculateRequest,
  CalculateResponse,
  CalculationLineItemResult,
  EcoTransitRequest,
  EcoTransitResponse,
  Method2CalculateRequest,
  Method2CalculateResponse,
  Method2MachineReference,
  NaicsOption,
} from '../../shared/calculator-types'
import { requestLocalApi } from './local-api.ts'

export type {
  CalculateRequest,
  CalculateResponse,
  CalculationLineItemResult,
  EcoTransitRequest,
  EcoTransitResponse,
  Method2CalculateRequest,
  Method2CalculateResponse,
  Method2MachineReference,
  NaicsOption,
}

export async function calculateEmissions(
  payload: CalculateRequest,
): Promise<CalculateResponse> {
  if (window.electronAPI?.calculateEmissions) {
    return window.electronAPI.calculateEmissions(payload)
  }

  return requestLocalApi({
    path: '/calculate',
    method: 'POST',
    json: payload,
  }) as Promise<CalculateResponse>
}

export async function calculateEcoTransitTransport(
  payload: EcoTransitRequest,
): Promise<EcoTransitResponse> {
  const body = await requestLocalApi({
    path: '/ecotransit',
    method: 'POST',
    json: payload,
  })
  return body as EcoTransitResponse
}

export async function fetchMethod2Machines(): Promise<Method2MachineReference[]> {
  const body = await requestLocalApi({ path: '/method2/machines' })
  const machines = body && typeof body === 'object' && 'machines' in body
    ? (body as { machines: unknown }).machines
    : null

  if (!Array.isArray(machines)) {
    throw new Error('Method 2 machine library was not returned by the API.')
  }

  return machines as Method2MachineReference[]
}

export async function calculateMethod2(
  payload: Method2CalculateRequest,
): Promise<Method2CalculateResponse> {
  const body = await requestLocalApi({
    path: '/method2/calculate',
    method: 'POST',
    json: payload,
  })

  return body as Method2CalculateResponse
}

export async function fetchNaicsOptions(): Promise<NaicsOption[]> {
  try {
    const body = await requestLocalApi({ path: '/naics' })

    if (!Array.isArray(body)) {
      throw new Error('Failed to fetch NAICS options from API')
    }

    const options = body
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const record = item as Record<string, unknown>
        const code = String(record.code ?? '').trim()
        const description = String(record.description ?? '').trim()
        if (!code || !description) return null
        const option: NaicsOption = { code, description }
        if (typeof record.category === 'string') {
          option.category = record.category
        }
        if (typeof record.kgco2e_per_usd === 'number') {
          option.kgco2e_per_usd = record.kgco2e_per_usd
        }
        return option
      })
      .filter((item): item is NaicsOption => item !== null)

    if (options.length === 0) {
      throw new Error('No NAICS options available from API')
    }

    return options
  } catch (error) {
    throw new Error(
      error instanceof Error 
        ? error.message 
        : 'Failed to connect to API. Please check that the API server is running.'
    )
  }
}
