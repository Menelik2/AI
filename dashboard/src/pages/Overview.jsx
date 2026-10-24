import { useEffect, useState } from 'react'
import {
  ShieldAlert,
  ShieldCheck,
  Crosshair,
  Activity,
  ArrowRight,
  Loader2,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { categoryColors } from '../lib/mockData'
import { healthCheck, listAttacks, listFailures, loadLastSession } from '../lib/api'

const BAR_COLORS = {
  prompt_injection: '#e11d48',
  tool_abuse: '#f97316',
  instruction_conflict: '#8b5cf6',
  social_engineering: '#0ea5e9',
  recovery: '#f59e0b',
  ambiguous: '#a1a1aa',
  capability: '#10b981',
}

function MetricCard({ label, value, sub, icon: Icon, tone = 'neutral' }) {
  const tones = {
    danger: 'text-rose-400',
    success: 'text-emerald-400',
    warn: 'text-amber-400',
    neutral: 'text-zinc-300',
  }
  return (
    <div className="card p-5 animate-slide-up">
      <div className="flex items-start justify-between">
        <div>
          <div className="label !mb-0">{label}</div>
          <div className={`mt-2 text-3xl font-semibold tracking-tight ${tones[tone]}`}>
            {value}
          </div>
          {sub && <div className="mt-1 text-xs text-zinc-500">{sub}</div>}
        </div>
        <div className="rounded-lg bg-white/[0.04] p-2.5">
          <Icon className={`h-5 w-5 ${tones[tone]}`} />
        </div>
      </div>
    </div>
  )
}

export default function Overview({ onNavigate }) {
  const [loading, setLoading] = useState(true)
  const [apiOk, setApiOk] = useState(false)
  const [attacks, setAttacks] = useState([])
  const [failures, setFailures] = useState([])
  const [session, setSession] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const health = await healthCheck()
      if (cancelled) return
      setApiOk(!!health)

      const last = loadLastSession()
      if (!cancelled) setSession(last)

      try {
        const [atk, fail] = await Promise.all([
          listAttacks().catch(() => []),
          listFailures(20).catch(() => ({ failures: [] })),
        ])
        if (cancelled) return
        setAttacks(Array.isArray(atk) ? atk : [])
        setFailures(fail.failures || [])
      } catch {
        /* keep empty */
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const metrics = session?.metrics || null
  const rate = metrics ? (metrics.attack_success_rate * 100).toFixed(0) : '—'
  const stillFailing = failures.filter((f) => f.still_failing === true).length
  const fixed = failures.filter((f) => f.still_failing === false).length

  const categoryCounts = attacks.reduce((acc, s) => {
    acc[s.category] = (acc[s.category] || 0) + 1
    return acc
  }, {})
  const chartData = Object.entries(categoryCounts).map(([name, count]) => ({
    name: name.replace(/_/g, ' '),
    count,
    raw: name,
  }))

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-zinc-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading…
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Overview</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Adaptive red-team results and failure regression suite
          </p>
        </div>
        <div
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
            apiOk
              ? 'bg-emerald-500/15 text-emerald-300'
              : 'bg-amber-500/15 text-amber-300'
          }`}
        >
          API {apiOk ? 'online' : 'offline'}
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Attack success rate"
          value={metrics ? `${rate}%` : '—'}
          sub={
            metrics
              ? `${metrics.successful_attacks} of ${metrics.total_attacks} attacks`
              : 'Run a session to populate'
          }
          icon={ShieldAlert}
          tone="danger"
        />
        <MetricCard
          label="Attacks resisted"
          value={metrics ? metrics.resisted_attacks : '—'}
          sub="Agent held the line"
          icon={ShieldCheck}
          tone="success"
        />
        <MetricCard
          label="Stored failures"
          value={failures.length}
          sub={`${stillFailing} still failing · ${fixed} fixed`}
          icon={Activity}
          tone="warn"
        />
        <MetricCard
          label="Attack strategies"
          value={attacks.length}
          sub={
            metrics
              ? `${(metrics.categories_hit || []).length} categories exercised`
              : 'From registry'
          }
          icon={Crosshair}
          tone="neutral"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="card p-5 lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-200">Strategies by category</h2>
            <button
              onClick={() => onNavigate?.('attacks')}
              className="btn-ghost text-xs text-zinc-400"
            >
              View library <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="h-56">
            {chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                No strategies loaded
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#71717a', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#71717a', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#1c1c1f',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: '#a1a1aa' }}
                    cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={48}>
                    {chartData.map((entry) => (
                      <Cell key={entry.raw} fill={BAR_COLORS[entry.raw] || '#a1a1aa'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <div className="card p-5">
            <h2 className="mb-3 text-sm font-semibold text-zinc-200">Quick actions</h2>
            <div className="space-y-2">
              <button onClick={() => onNavigate?.('run')} className="btn-primary w-full">
                Run new red-team session
              </button>
              <button onClick={() => onNavigate?.('session')} className="btn-outline w-full">
                View last session report
              </button>
              <button onClick={() => onNavigate?.('failures')} className="btn-ghost w-full">
                Open failure DB
              </button>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="mb-3 text-sm font-semibold text-zinc-200">Recent failures</h2>
            {failures.length === 0 ? (
              <p className="text-xs text-zinc-500">No stored failures yet. Run a session.</p>
            ) : (
              <ul className="space-y-3">
                {failures.slice(0, 3).map((f) => (
                  <li key={f.id} className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                        f.still_failing === false
                          ? 'bg-emerald-400'
                          : f.still_failing === true
                          ? 'bg-rose-400'
                          : 'bg-amber-400'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-xs text-zinc-300">{f.strategy_id}</div>
                      <div className="truncate text-[11px] text-zinc-500">{f.category}</div>
                    </div>
                    <span
                      className={`badge ${
                        f.still_failing === false
                          ? 'badge-success'
                          : f.still_failing === true
                          ? 'badge-danger'
                          : 'badge-warn'
                      }`}
                    >
                      {f.still_failing === false
                        ? 'fixed'
                        : f.still_failing === true
                        ? 'open'
                        : 'new'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {metrics?.categories_hit?.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-200">Categories in last session</h2>
          <div className="flex flex-wrap gap-2">
            {metrics.categories_hit.map((c) => (
              <span
                key={c}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${categoryColors[c] || 'badge-neutral'}`}
              >
                {c.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
