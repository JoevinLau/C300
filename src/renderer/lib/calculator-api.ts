import type {
  CalculateRequest,
  CalculateResponse,
  EcoTransitRequest,
  EcoTransitResponse,
  Method2CalculateRequest,
  Method2CalculateResponse,
  Method2MachineReference,
  NaicsOption,
} from '../../shared/calculator-types'

export type {
  CalculateRequest,
  CalculateResponse,
  EcoTransitRequest,
  EcoTransitResponse,
  Method2CalculateRequest,
  Method2CalculateResponse,
  Method2MachineReference,
  NaicsOption,
}

const API_BASES = ['http://127.0.0.1:8000', 'http://localhost:8000']
const API_BASE = API_BASES[0]

function formatApiError(detail: unknown): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (item && typeof item === 'object' && 'msg' in item) {
          const record = item as { msg: string; loc?: unknown }
          const field = Array.isArray(record.loc)
            ? record.loc.filter((part) => part !== 'body').join('.')
            : ''
          return field ? `${field}: ${record.msg}` : String(record.msg)
        }
        return JSON.stringify(item)
      })
      .join('; ')
  }
  return 'Calculation failed. Check your inputs and that the API on port 8000 is running.'
}

async function fetchCalculate(payload: CalculateRequest): Promise<CalculateResponse> {
  const response = await fetch(`${API_BASE}/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const body: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const detail =
      body && typeof body === 'object' && 'detail' in body
        ? (body as { detail: unknown }).detail
        : `Request failed (${response.status})`
    throw new Error(formatApiError(detail))
  }

  return body as CalculateResponse
}

async function fetchJsonFromApi(path: string, init?: RequestInit): Promise<unknown> {
  let lastError: unknown = null

  for (const base of API_BASES) {
    try {
      const response = await fetch(`${base}${path}`, init)
      const body: unknown = await response.json().catch(() => null)

      if (!response.ok) {
        const detail =
          body && typeof body === 'object' && 'detail' in body
            ? (body as { detail: unknown }).detail
            : `Request failed (${response.status})`
        throw new Error(formatApiError(detail))
      }

      return body
    } catch (error) {
      lastError = error
      if (error instanceof Error && error.message !== 'Failed to fetch') {
        throw error
      }
    }
  }

  throw new Error(
    'Cannot connect to the local API server on port 8000. Start the FastAPI backend, then try Calculate transport again.',
  )
}

export async function calculateEmissions(
  payload: CalculateRequest,
): Promise<CalculateResponse> {
  if (window.electronAPI?.calculateEmissions) {
    return window.electronAPI.calculateEmissions(payload)
  }

  return fetchCalculate(payload)
}

export async function calculateEcoTransitTransport(
  payload: EcoTransitRequest,
): Promise<EcoTransitResponse> {
  const body = await fetchJsonFromApi('/ecotransit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  return body as EcoTransitResponse
}

export async function fetchMethod2Machines(): Promise<Method2MachineReference[]> {
  const body = await fetchJsonFromApi('/method2/machines')
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
  const body = await fetchJsonFromApi('/method2/calculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  return body as Method2CalculateResponse
}

export async function fetchNaicsOptions(): Promise<NaicsOption[]> {
  try {
    const response = await fetch(`${API_BASE}/naics`)
    const body: unknown = await response.json().catch(() => null)

    if (!response.ok || !Array.isArray(body)) {
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
