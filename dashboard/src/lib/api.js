/**
 * Client for Agent Stress Lab FastAPI backend.
 *
 * Production (Vercel Services): same-origin `/api`.
 * Local override: set VITE_API_URL (e.g. http://127.0.0.1:8000).
 */

const BASE = import.meta.env.VITE_API_URL || '/api'

const SESSION_KEY = 'asl_last_session'

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  if (!res.ok) {
    let message = res.statusText
    try {
      const body = await res.json()
      message = body.detail
        ? typeof body.detail === 'string'
          ? body.detail
          : JSON.stringify(body.detail)
        : JSON.stringify(body)
    } catch {
      try {
        message = await res.text()
      } catch {
        /* keep statusText */
      }
    }
    throw new Error(message || res.statusText)
  }
  if (res.status === 204) return null
  return res.json()
}

export async function healthCheck() {
  try {
    return await request('/health')
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
  return request('/run', { method: 'POST', body: JSON.stringify(body) })
}

export async function listFailures(limit = 50) {
  const data = await request(`/failures?limit=${limit}`)
  return {
    total: data.total ?? (data.failures || []).length,
    failures: data.failures || data || [],
  }
}

export async function getFailure(id) {
  return request(`/failures/${id}`)
}

export async function replayFailure(id, body = { adapter: 'mock' }) {
  return request(`/failures/${id}/replay`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function saveLastSession(session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    /* private mode */
  }
}

export function loadLastSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export { BASE as API_BASE }
