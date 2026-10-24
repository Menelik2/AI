/**
 * Client for Agent Stress Lab FastAPI backend.
 *
 * Production (Vercel Services): same-origin `/api`.
 * Local override: set VITE_API_URL (e.g. http://127.0.0.1:8000/api).
 */

const BASE = import.meta.env.VITE_API_URL || '/api'
const SESSION_KEY = 'asl_last_session'
const DEFAULT_TIMEOUT_MS = 120_000

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'error', details = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

function parseErrorBody(body, fallback) {
  if (!body) return { message: fallback, code: 'error', details: null }
  if (typeof body === 'string') return { message: body, code: 'error', details: null }
  // Structured API errors: { error: { code, message, details } }
  if (body.error && typeof body.error === 'object') {
    return {
      message: body.error.message || fallback,
      code: body.error.code || 'error',
      details: body.error.details ?? null,
    }
  }
  // FastAPI default: { detail: string | object }
  if (body.detail !== undefined) {
    const detail = body.detail
    return {
      message: typeof detail === 'string' ? detail : JSON.stringify(detail),
      code: 'http_error',
      details: typeof detail === 'string' ? null : detail,
    }
  }
  return { message: JSON.stringify(body), code: 'error', details: body }
}

async function request(path, options = {}) {
  const { timeout = DEFAULT_TIMEOUT_MS, ...fetchOpts } = options
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(fetchOpts.headers || {}) },
      ...fetchOpts,
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    if (err?.name === 'AbortError') {
      throw new ApiError('Request timed out. The server took too long to respond.', {
        status: 0,
        code: 'timeout',
      })
    }
    throw new ApiError(
      err?.message
        ? `Network error: ${err.message}`
        : 'Network error: could not reach the API',
      { status: 0, code: 'network' }
    )
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    let parsed = { message: res.statusText || `HTTP ${res.status}`, code: 'http_error', details: null }
    try {
      const body = await res.json()
      parsed = parseErrorBody(body, parsed.message)
    } catch {
      try {
        const text = await res.text()
        if (text) parsed.message = text.slice(0, 400)
      } catch {
        /* keep statusText */
      }
    }
    throw new ApiError(parsed.message, {
      status: res.status,
      code: parsed.code,
      details: parsed.details,
    })
  }

  if (res.status === 204) return null

  try {
    return await res.json()
  } catch {
    throw new ApiError('Server returned invalid JSON', {
      status: res.status,
      code: 'invalid_json',
    })
  }
}

export async function healthCheck() {
  try {
    return await request('/health', { timeout: 8_000 })
  } catch {
    return null
  }
}

export async function listAdapters() {
  const data = await request('/adapters')
  return data.adapters || data || []
}

export async function listAttacks(category) {
  const q = category ? `?category=${encodeURIComponent(category)}` : ''
  const data = await request(`/attacks${q}`)
  return data.attacks || data || []
}

export async function runSession(body) {
  // Red-team can take a while (many adaptive attacks)
  return request('/run', {
    method: 'POST',
    body: JSON.stringify(body),
    timeout: 280_000,
  })
}

export async function listFailures(limit = 50) {
  const data = await request(`/failures?limit=${limit}`)
  return {
    total: data.total ?? (data.failures || []).length,
    failures: data.failures || data || [],
  }
}

export async function getFailure(id) {
  return request(`/failures/${encodeURIComponent(id)}`)
}

export async function replayFailure(id, body = { adapter: 'mock' }) {
  return request(`/failures/${encodeURIComponent(id)}/replay`, {
    method: 'POST',
    body: JSON.stringify(body),
    timeout: 120_000,
  })
}

export function saveLastSession(session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch (err) {
    console.warn('Could not save session to localStorage', err)
  }
}

export function loadLastSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch (err) {
    console.warn('Could not load session from localStorage', err)
    return null
  }
}

export { BASE as API_BASE }
