import type { CalculateRequest, CalculateResponse, NaicsOption } from '../../shared/calculator-types'

export type { CalculateRequest, CalculateResponse, NaicsOption }

const API_BASE = 'http://127.0.0.1:8000'

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

export async function calculateEmissions(
  payload: CalculateRequest,
): Promise<CalculateResponse> {
  if (window.electronAPI?.calculateEmissions) {
    return window.electronAPI.calculateEmissions(payload)
  }

  return fetchCalculate(payload)
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
