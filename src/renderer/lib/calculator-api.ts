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
import { requestLocalApi } from './local-api'

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

const TRANSPORT_DISTANCES_TO_SINGAPORE_KM: Record<string, number> = {
  Singapore: 50,
  China: 3600,
  Japan: 5300,
  'South Korea': 3800,
  Vietnam: 1700,
  Indonesia: 1500,
  Malaysia: 400,
  Thailand: 1400,
  Philippines: 1700,
  Cambodia: 1500,
  Laos: 1600,
  'United States': 15300,
  Germany: 10400,
  India: 4300,
  Brazil: 17500,
  Australia: 3800,
  Canada: 13800,
}
const TRANSPORT_FACTORS_KG_PER_TKM: Record<string, number> = {
  sea: 0.016,
  vessel: 0.016,
  ship: 0.016,
  land: 0.12,
  truck: 0.12,
  air: 1.2,
  rail: 0.035,
}

function isEcoTransitScraperLocationError(error: unknown) {
  return error instanceof Error && error.message.includes('EcoTransit location field')
}

function calculateLocalTransportFallback(payload: EcoTransitRequest): EcoTransitResponse {
  const origin = payload.origin_country?.trim() || payload.port_of_loading.trim()
  const distanceKm = TRANSPORT_DISTANCES_TO_SINGAPORE_KM[origin]
  const mode = payload.transport_mode === 'vessel'
    ? 'sea'
    : payload.transport_mode === 'truck'
      ? 'land'
      : payload.transport_mode
  const factor = TRANSPORT_FACTORS_KG_PER_TKM[payload.transport_mode] ?? TRANSPORT_FACTORS_KG_PER_TKM[mode]

  if (distanceKm == null || factor == null) {
    throw new Error(
      `EcoTransit is unavailable and no local transport estimate is configured for ${origin} / ${payload.transport_mode}.`,
    )
  }

  const weightTonnes = payload.weight_kg / 1000
  const emissions = weightTonnes * distanceKm * factor

  return {
    transport: {
      origin,
      port_of_loading: payload.port_of_loading,
      port_of_discharge: payload.port_of_discharge,
      weight_kg: payload.weight_kg,
      chosen_mode: mode,
      chosen_emissions_kg: emissions,
      distance_km: distanceKm,
      energy_mj: null,
      source: 'Local estimate (EcoTransit unavailable)',
      raw: {
        method: 'weight_tonnes * distance_km * kgco2e_per_tonne_km',
        weight_tonnes: weightTonnes,
        distance_km: distanceKm,
        kgco2e_per_tonne_km: factor,
        reason: 'EcoTransit calculator redirected or did not expose location fields.',
      },
    },
  }
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
  let body: unknown
  try {
    body = await requestLocalApi({
      path: '/ecotransit',
      method: 'POST',
      json: payload,
    })
  } catch (error) {
    if (isEcoTransitScraperLocationError(error)) {
      return calculateLocalTransportFallback(payload)
    }
    throw error
  }

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
