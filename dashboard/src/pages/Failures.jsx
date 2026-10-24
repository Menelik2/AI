import { useEffect, useState } from 'react'
import { RefreshCw, Search, Filter, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import { categoryColors } from '../lib/mockData'
import { listFailures, replayFailure } from '../lib/api'

export default function Failures() {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [replaying, setReplaying] = useState(null)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [replayMsg, setReplayMsg] = useState(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listFailures(100)
      setRows(data.failures || [])
      setTotal(data.total ?? (data.failures || []).length)
    } catch (e) {
      setError(e.message || 'Failed to load failures')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = rows.filter((f) => {
    const q = query.toLowerCase()
    const matchQ =
      !q ||
      (f.strategy_id || '').includes(q) ||
      (f.category || '').includes(q) ||
      (f.id || '').includes(q) ||
      (f.agent_name || '').toLowerCase().includes(q)
    const matchF =
      filter === 'all' ||
      (filter === 'open' && f.still_failing !== false) ||
      (filter === 'fixed' && f.still_failing === false)
    return matchQ && matchF
  })

  const handleReplay = async (id) => {
    setReplaying(id)
    setReplayMsg(null)
    try {
      const result = await replayFailure(id, { adapter: 'mock' })
      setRows((prev) =>
        prev.map((f) =>
          f.id === id
            ? {
                ...f,
                replay_count: result.replay_count ?? f.replay_count + 1,
                last_replayed_at: result.last_replayed_at || new Date().toISOString(),
                still_failing: result.still_failing,
                evidence: result.evidence?.length ? result.evidence : f.evidence,
              }
            : f
        )
      )
      setSelected((prev) =>
        prev?.id === id
          ? {
              ...prev,
              still_failing: result.still_failing,
              replay_count: result.replay_count ?? prev.replay_count + 1,
              evidence: result.evidence?.length ? result.evidence : prev.evidence,
            }
          : prev
      )
      setReplayMsg(
        result.still_failing
          ? 'Still failing — policy violation still present'
          : 'Fixed — agent now resists this attack'
      )
    } catch (e) {
      setReplayMsg(e.message || 'Replay failed')
    } finally {
      setReplaying(null)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-zinc-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading failures…
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Failure DB</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Confirmed policy violations · {total} total · replay as regression suite
          </p>
        </div>
        <button onClick={load} className="btn-ghost text-xs">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </header>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}
      {replayMsg && (
        <div className="rounded-lg border border-white/[0.08] bg-surface-850 px-4 py-3 text-sm text-zinc-300">
          {replayMsg}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            className="input pl-9"
            placeholder="Search strategy, category, agent, id…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-1 rounded-lg border border-white/[0.08] bg-surface-850 p-0.5">
          {['all', 'open', 'fixed'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={clsx(
                'rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                filter === f ? 'bg-white/[0.08] text-white' : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="card overflow-hidden lg:col-span-3">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wider text-zinc-500">
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">Strategy</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Replays</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filtered.map((f) => (
                  <tr
                    key={f.id}
                    onClick={() => setSelected(f)}
                    className={clsx(
                      'cursor-pointer transition-colors hover:bg-white/[0.02]',
                      selected?.id === f.id && 'bg-accent/5'
                    )}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-zinc-400">{f.id}</td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-zinc-200">{f.strategy_id}</div>
                      <div className="text-[11px] text-zinc-500">{f.category}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          f.still_failing === false
                            ? 'badge-success'
                            : f.still_failing === true
                            ? 'badge-danger'
                            : 'badge-warn'
                        }
                      >
                        {f.still_failing === false
                          ? 'fixed'
                          : f.still_failing === true
                          ? 'open'
                          : 'new'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">{f.replay_count}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleReplay(f.id)
                        }}
                        disabled={replaying === f.id}
                        className="btn-ghost p-1.5"
                        title="Replay"
                      >
                        <RefreshCw
                          className={clsx(
                            'h-3.5 w-3.5',
                            replaying === f.id && 'animate-spin text-accent'
                          )}
                        />
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-sm text-zinc-500">
                      No failures match your filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card p-5 lg:col-span-2">
          {selected ? (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-mono text-sm text-white">{selected.id}</div>
                  <div className="mt-0.5 text-xs text-zinc-500">{selected.agent_name}</div>
                </div>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    categoryColors[selected.category] || 'badge-neutral'
                  }`}
                >
                  {(selected.category || '').replace(/_/g, ' ')}
                </span>
              </div>
              <div>
                <div className="label">Strategy</div>
                <div className="font-mono text-xs text-zinc-300">{selected.strategy_id}</div>
              </div>
              <div>
                <div className="label">Payload</div>
                <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-950 p-3 font-mono text-[11px] text-zinc-400">
                  {selected.payload}
                </pre>
              </div>
              {selected.evidence?.length > 0 && (
                <div>
                  <div className="label">Evidence</div>
                  <ul className="mt-1 space-y-1">
                    {selected.evidence.map((e, i) => (
                      <li key={i} className="text-xs text-rose-300">
                        • {e}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => handleReplay(selected.id)}
                  disabled={replaying === selected.id}
                  className="btn-primary flex-1 text-xs"
                >
                  <RefreshCw
                    className={clsx('h-3.5 w-3.5', replaying === selected.id && 'animate-spin')}
                  />
                  Replay
                </button>
              </div>
            </div>
          ) : (
            <div className="flex h-48 flex-col items-center justify-center text-center">
              <Filter className="mb-2 h-8 w-8 text-zinc-700" />
              <p className="text-sm text-zinc-500">Select a failure to inspect</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
