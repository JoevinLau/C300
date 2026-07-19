import type { LocalApiRequest } from '../../shared/electron-api'

const configuredApiBase = (
  import.meta as ImportMeta & { env?: { VITE_API_BASE_URL?: string } }
).env?.VITE_API_BASE_URL?.trim()
const API_BASES = [
  configuredApiBase,
  'http://127.0.0.1:8000',
  'http://localhost:8000',
].filter((base, index, all): base is string => Boolean(base) && all.indexOf(base) === index)

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
  return 'Local API request failed.'
}

async function fetchLocalApi(base: string, request: LocalApiRequest): Promise<unknown> {
  const headers = new Headers()
  let body: BodyInit | undefined

  if (request.json !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(request.json)
  } else if (request.fields || request.files) {
    const formData = new FormData()
    Object.entries(request.fields ?? {}).forEach(([name, value]) => {
      formData.append(name, value)
    })
    request.files?.forEach((file) => {
      const bytes = Uint8Array.from(file.bytes)
      formData.append(
        file.fieldName,
        new Blob([bytes.buffer], { type: file.contentType }),
        file.name,
      )
    })
    body = formData
  }

  const response = await fetch(`${base}${request.path}`, {
    method: request.method ?? 'GET',
    headers,
    body,
  })
  const text = await response.text()
  let responseBody: unknown = null
  if (text) {
    try {
      responseBody = JSON.parse(text) as unknown
    } catch {
      responseBody = text
    }
  }

  if (!response.ok) {
    const detail =
      responseBody && typeof responseBody === 'object' && 'detail' in responseBody
        ? (responseBody as { detail: unknown }).detail
        : `Request failed (${response.status})`
    throw new Error(formatApiError(detail))
  }
  return responseBody
}

export async function requestLocalApi(request: LocalApiRequest): Promise<unknown> {
  if (typeof window !== 'undefined' && window.electronAPI?.requestLocalApi) {
    return window.electronAPI.requestLocalApi(request)
  }

  let lastError: unknown = null
  for (const base of API_BASES) {
    try {
      return await fetchLocalApi(base, request)
    } catch (error) {
      lastError = error
      if (!(error instanceof TypeError)) throw error
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Cannot connect to the local API server on port 8000.')
}
