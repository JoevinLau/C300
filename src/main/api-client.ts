import type { CalculateRequest, CalculateResponse } from '../shared/calculator-types'
import type { LocalApiMethod, LocalApiRequest } from '../shared/local-api-types'

const DEFAULT_API_PORT = 8000
let apiBase = `http://127.0.0.1:${DEFAULT_API_PORT}`
const DEFAULT_TIMEOUT_MS = 60_000

interface LocalApiRequestOptions {
  timeoutMs?: number
  signal?: AbortSignal
}

export function configureLocalApiPort(port: number): void {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new RangeError(`Invalid local API port: ${port}`)
  }
  apiBase = `http://127.0.0.1:${port}`
}

const ALLOWED_ROUTES: Array<{ methods: LocalApiMethod[]; path: RegExp }> = [
  { methods: ['POST'], path: /^\/calculate$/ },
  { methods: ['GET'], path: /^\/naics$/ },
  { methods: ['GET'], path: /^\/api\/naics\/search$/ },
  { methods: ['GET'], path: /^\/api\/naics\/llm-suggest$/ },
  { methods: ['GET'], path: /^\/api\/naics\/factor\/\d{6}$/ },
  { methods: ['POST'], path: /^\/api\/naics\/confirm$/ },
  { methods: ['POST'], path: /^\/api\/calculate\/batch$/ },
  { methods: ['POST'], path: /^\/ecotransit$/ },
  { methods: ['GET'], path: /^\/method2\/machines$/ },
  { methods: ['POST'], path: /^\/method2\/calculate$/ },
  { methods: ['GET', 'POST'], path: /^\/rag\/documents$/ },
  { methods: ['DELETE'], path: /^\/rag\/documents\/[^/]+$/ },
  { methods: ['POST'], path: /^\/method2-chat$/ },
]

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
  return `API request failed (${apiBase})`
}

function resolveAllowedUrl(request: LocalApiRequest): { method: LocalApiMethod; url: URL } {
  const method = request.method ?? 'GET'
  const url = new URL(request.path, apiBase)
  const allowed =
    url.origin === apiBase &&
    ALLOWED_ROUTES.some(
      (route) => route.methods.includes(method) && route.path.test(url.pathname),
    )

  if (!allowed) {
    throw new TypeError(`Local API route is not allowed: ${method} ${request.path}`)
  }
  if (request.json !== undefined && (request.fields || request.files)) {
    throw new TypeError('Local API requests cannot combine JSON and multipart data.')
  }

  return { method, url }
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

export async function requestLocalApi<T = unknown>(
  request: LocalApiRequest,
  options: LocalApiRequestOptions = {},
): Promise<T> {
  const { method, url } = resolveAllowedUrl(request)
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

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const forwardAbort = () => controller.abort(options.signal?.reason)
  if (options.signal?.aborted) forwardAbort()
  else options.signal?.addEventListener('abort', forwardAbort, { once: true })

  try {
    const response = await fetch(url, { method, headers, body, signal: controller.signal })
    const responseBody = await parseResponse(response)
    if (!response.ok) {
      const detail =
        responseBody && typeof responseBody === 'object' && 'detail' in responseBody
          ? (responseBody as { detail: unknown }).detail
          : `Request failed (${response.status})`
      throw new Error(formatApiError(detail))
    }
    return responseBody as T
  } catch (error) {
    if (timedOut) {
      throw new Error(`Local API request timed out after ${timeoutMs} ms.`, {
        cause: error,
      })
    }
    throw error
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', forwardAbort)
  }
}

export async function postCalculate(payload: CalculateRequest): Promise<CalculateResponse> {
  return requestLocalApi({
    path: '/calculate',
    method: 'POST',
    json: payload,
  }) as Promise<CalculateResponse>
}
