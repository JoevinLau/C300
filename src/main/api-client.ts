import type { CalculateRequest, CalculateResponse } from '../shared/calculator-types'

const API_BASE = 'http://127.0.0.1:8000'

function formatApiError(detail: unknown): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (item && typeof item === 'object' && 'msg' in item) {
          return String((item as { msg: string }).msg)
        }
        return JSON.stringify(item)
      })
      .join('; ')
  }
  return `API request failed (${API_BASE})`
}

export async function postCalculate(payload: CalculateRequest): Promise<CalculateResponse> {
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
