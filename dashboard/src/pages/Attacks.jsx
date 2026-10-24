import { useState } from 'react'
import { Search } from 'lucide-react'
import clsx from 'clsx'
import { attackStrategies, categoryColors, severityColors } from '../lib/mockData'

const categories = [...new Set(attackStrategies.map((s) => s.category))]

export default function Attacks() {
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState('all')

  const filtered = attackStrategies.filter((s) => {
    const q = query.toLowerCase()
    const matchQ =
      !q || s.id.includes(q) || s.name.toLowerCase().includes(q) || s.category.includes(q)
    const matchC = cat === 'all' || s.category === cat
    return matchQ && matchC
  })

  return (
    <div className="space-y-6 animate-fade-in">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Attack Library</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {attackStrategies.length} registered strategies across {categories.length} categories
        </p>
      </header>

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
                cat === c
                  ? categoryColors[c]
                  : 'text-zinc-500 hover:text-zinc-300'
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
            <div className="mt-3">
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  categoryColors[s.category] || 'badge-neutral'
                }`}
              >
                {s.category.replace(/_/g, ' ')}
              </span>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="py-16 text-center text-sm text-zinc-500">No strategies match</div>
      )}
    </div>
  )
}
