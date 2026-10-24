import {
  ShieldAlert,
  ShieldCheck,
  Crosshair,
  Activity,
  ArrowRight,
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
import { sessionMetrics, storedFailures, attackStrategies, categoryColors } from '../lib/mockData'

const categoryCounts = attackStrategies.reduce((acc, s) => {
  acc[s.category] = (acc[s.category] || 0) + 1
  return acc
}, {})

const chartData = Object.entries(categoryCounts).map(([name, count]) => ({
  name: name.replace(/_/g, ' '),
  count,
  raw: name,
}))

const stillFailing = storedFailures.filter((f) => f.still_failing === true).length
const fixed = storedFailures.filter((f) => f.still_failing === false).length

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
  const rate = (sessionMetrics.attack_success_rate * 100).toFixed(0)

  return (
    <div className="space-y-8 animate-fade-in">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Overview</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Adaptive red-team results and failure regression suite
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Attack success rate"
          value={`${rate}%`}
          sub={`${sessionMetrics.successful_attacks} of ${sessionMetrics.total_attacks} attacks`}
          icon={ShieldAlert}
          tone="danger"
        />
        <MetricCard
          label="Attacks resisted"
          value={sessionMetrics.resisted_attacks}
          sub="Agent held the line"
          icon={ShieldCheck}
          tone="success"
        />
        <MetricCard
          label="Stored failures"
          value={storedFailures.length}
          sub={`${stillFailing} still failing · ${fixed} fixed`}
          icon={Activity}
          tone="warn"
        />
        <MetricCard
          label="Attack strategies"
          value={attackStrategies.length}
          sub={`${sessionMetrics.categories_hit.length} categories exercised`}
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
                    <Cell
                      key={entry.raw}
                      fill={
                        entry.raw === 'prompt_injection'
                          ? '#e11d48'
                          : entry.raw === 'tool_abuse'
                          ? '#f97316'
                          : entry.raw === 'instruction_conflict'
                          ? '#8b5cf6'
                          : entry.raw === 'social_engineering'
                          ? '#0ea5e9'
                          : '#a1a1aa'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
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
            <ul className="space-y-3">
              {storedFailures.slice(0, 3).map((f) => (
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
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-200">Categories in last session</h2>
        <div className="flex flex-wrap gap-2">
          {sessionMetrics.categories_hit.map((c) => (
            <span
              key={c}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${categoryColors[c] || 'badge-neutral'}`}
            >
              {c.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
