import { useState } from 'react'
import { CheckCircle2, XCircle, ChevronDown, ChevronRight, Clock } from 'lucide-react'
import clsx from 'clsx'
import { recentSession, categoryColors } from '../lib/mockData'

export default function SessionReport() {
  const { metrics, attacks, agent, generated_at } = recentSession
  const [expanded, setExpanded] = useState(null)

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Last Session</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Target <span className="font-mono text-zinc-400">{agent}</span>
            <span className="mx-2 text-zinc-700">·</span>
            {new Date(generated_at).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Clock className="h-3.5 w-3.5" />
          Evidence-based report
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: 'Total', value: metrics.total_attacks },
          { label: 'Violations', value: metrics.successful_attacks, tone: 'danger' },
          { label: 'Success rate', value: `${(metrics.attack_success_rate * 100).toFixed(0)}%`, tone: 'danger' },
          { label: 'Resisted', value: metrics.resisted_attacks, tone: 'success' },
          { label: 'Strategies', value: metrics.unique_strategies_used },
        ].map((m) => (
          <div key={m.label} className="card px-4 py-3">
            <div className="label !mb-0">{m.label}</div>
            <div
              className={clsx(
                'mt-1 text-xl font-semibold',
                m.tone === 'danger' && 'text-rose-400',
                m.tone === 'success' && 'text-emerald-400',
                !m.tone && 'text-zinc-200'
              )}
            >
              {m.value}
            </div>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-white/[0.06] px-5 py-3">
          <h2 className="text-sm font-semibold text-zinc-200">Attacks attempted</h2>
        </div>
        <ul className="divide-y divide-white/[0.04]">
          {attacks.map((a) => {
            const open = expanded === a.attack_id
            const success = a.outcome === 'success'
            return (
              <li key={a.attack_id}>
                <button
                  onClick={() => setExpanded(open ? null : a.attack_id)}
                  className="flex w-full items-start gap-3 px-5 py-3.5 text-left transition-colors hover:bg-white/[0.02]"
                >
                  <div className="mt-0.5">
                    {success ? (
                      <XCircle className="h-4 w-4 text-rose-400" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-zinc-300">{a.attack_id}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          categoryColors[a.category] || 'badge-neutral'
                        }`}
                      >
                        {a.category.replace(/_/g, ' ')}
                      </span>
                      <span className={success ? 'badge-danger' : 'badge-success'}>
                        {success ? 'violation' : 'resisted'}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-1 text-xs text-zinc-500">{a.payload}</p>
                  </div>
                  {open ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" />
                  )}
                </button>
                {open && (
                  <div className="space-y-3 border-t border-white/[0.04] bg-surface-850/50 px-5 py-4 pl-12">
                    <div>
                      <div className="label">Payload</div>
                      <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-surface-950 p-3 font-mono text-xs text-zinc-300">
                        {a.payload}
                      </pre>
                    </div>
                    {a.evidence?.length > 0 && (
                      <div>
                        <div className="label">Evidence</div>
                        <ul className="mt-1 space-y-1">
                          {a.evidence.map((e, i) => (
                            <li key={i} className="flex gap-2 text-xs text-rose-300">
                              <span className="text-rose-500">•</span>
                              {e}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div>
                      <div className="label">Response excerpt</div>
                      <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                        {a.response_content}
                      </p>
                    </div>
                    <div className="text-[11px] text-zinc-600">{a.notes}</div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
