import { useEffect, useState } from 'react'
import { Search, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import { categoryColors, severityColors } from '../lib/mockData'
import { listAttacks } from '../lib/api'

export default function Attacks() {
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState('all')
  const [strategies, setStrategies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await listAttacks()
        if (!cancelled) setStrategies(Array.isArray(data) ? data : [])
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load attacks')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const categories = [...new Set(strategies.map((s) => s.category))]

  const filtered = strategies.filter((s) => {
    const q = query.toLowerCase()
    const matchQ =
      !q ||
      (s.id || '').includes(q) ||
      (s.name || '').toLowerCase().includes(q) ||
      (s.category || '').includes(q)
    const matchC = cat === 'all' || s.category === cat
    return matchQ && matchC
  })

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-zinc-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading attack library…
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Attack Library</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {strategies.length} registered strategies
          {categories.length ? ` across ${categories.length} categories` : ''}
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            className="input pl-9"
            placeholder="Search strategies…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setCat('all')}
            className={clsx(
              'rounded-md px-2.5 py-1.5 text-xs font-medium',
              cat === 'all' ? 'bg-white/[0.1] text-white' : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={clsx(
                'rounded-md px-2.5 py-1.5 text-xs font-medium capitalize',
                cat === c ? categoryColors[c] : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              {c.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((s) => (
          <div key={s.id} className="card card-hover p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="font-mono text-xs text-zinc-400">{s.id}</div>
              <span className={severityColors[s.severity] || 'badge-neutral'}>{s.severity}</span>
            </div>
            <h3 className="mt-2 text-sm font-medium text-zinc-100">{s.name}</h3>
            {s.description && (
              <p className="mt-1 line-clamp-2 text-[11px] text-zinc-500">{s.description}</p>
            )}
            <div className="mt-3">
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  categoryColors[s.category] || 'badge-neutral'
                }`}
              >
                {(s.category || '').replace(/_/g, ' ')}
              </span>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && !error && (
        <div className="py-16 text-center text-sm text-zinc-500">No strategies match</div>
      )}
    </div>
  )
}
