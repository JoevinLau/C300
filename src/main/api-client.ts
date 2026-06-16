import type { CalculateRequest, CalculateResponse } from '../shared/calculator-types'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

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
  return `API request failed (${API_BASE})`
}

export async function postCalculate(payload: CalculateRequest): Promise<CalculateResponse> {
  // Try Python CLI in project `api/cli_compute.py` so calculation runs from `calculation/`
  try {
    const scriptPath = path.join(__dirname, '..', '..', 'api', 'cli_compute.py')
    const candidates = ['python', 'python3', 'py']
    for (const exe of candidates) {
      try {
        const proc = spawnSync(exe, [scriptPath], {
          input: JSON.stringify(payload),
          encoding: 'utf8',
          maxBuffer: 20 * 1024 * 1024,
        })

        if (proc.status === 0 && proc.stdout) {
          try {
            const parsed = JSON.parse(proc.stdout)
            return parsed as CalculateResponse
          } catch (e) {
            // parse failed; continue to next candidate or fallback
          }
        }
      } catch (e) {
        // ignore and try next python executable
      }
    }
  } catch (e) {
    // ignore and fall back to HTTP
  }

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
