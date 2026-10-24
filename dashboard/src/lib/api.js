/**
 * Client for Agent Stress Lab FastAPI backend.
 * Set VITE_API_URL (default http://127.0.0.1:8000).
 */

const BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(body || res.statusText)
  }
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
  return request('/adapters')
}

export async function listAttacks(category) {
  const q = category ? `?category=${encodeURIComponent(category)}` : ''
  return request(`/attacks${q}`)
}

export async function runSession(body) {
  return request('/run', { method: 'POST', body: JSON.stringify(body) })
}

export async function listFailures(limit = 50) {
  return request(`/failures?limit=${limit}`)
}

export async function replayFailure(id, body = { adapter: 'mock' }) {
  return request(`/failures/${id}/replay`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export { BASE as API_BASE }
