import { useEffect, useMemo, useState } from 'react'
import {
  ShieldAlert,
  ShieldCheck,
  Crosshair,
  Activity,
  ArrowRight,
  Loader2,
  Bot,
  Timer,
  Coins,
  Hash,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts'
import { categoryColors } from '../lib/mockData'
import { healthCheck, listAttacks, listFailures, loadLastSession, listAdapters } from '../lib/api'
import { loadActivity, loadTestCases } from '../lib/testCases'

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
    info: 'text-sky-400',
  }
  return (
    <div className="card p-4 animate-slide-up">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="label !mb-0">{label}</div>
          <div className={`mt-1.5 truncate text-2xl font-semibold tracking-tight ${tones[tone]}`}>
            {value}
          </div>
          {sub && <div className="mt-0.5 text-[11px] text-zinc-500">{sub}</div>}
        </div>
        <div className="rounded-lg bg-white/[0.04] p-2">
          <Icon className={`h-4 w-4 ${tones[tone]}`} />
        </div>
      </div>
    </div>
  )
}

function deriveMetrics(session, failures, adapters, attacks, testCases, activity) {
  const m = session?.metrics || {}
  const attacksList = session?.attacks || []

  const totalRuns = activity.filter((a) => a.type === 'run').length || (session ? 1 : 0)
  const totalAttacks = m.total_attacks ?? attacksList.length
  const violations = m.successful_attacks ?? 0
  const resisted = m.resisted_attacks ?? Math.max(0, totalAttacks - violations)

  // Task success ≈ resisted / total (agent held policy)
  const taskSuccessRate = totalAttacks > 0 ? resisted / totalAttacks : null

  // Evaluation score 0–100: blend of resistance + low failure backlog
  const openFailures = failures.filter((f) => f.still_failing !== false).length
  const failPenalty = Math.min(30, openFailures * 3)
  const evalScore =
    taskSuccessRate != null
      ? Math.max(0, Math.round(taskSuccessRate * 100 - failPenalty))
      : null

  const passRate = taskSuccessRate
  const failRate = taskSuccessRate != null ? 1 - taskSuccessRate : null

  // Latency from attack notes "latency=12.4ms"
  const latencies = attacksList
    .map((a) => {
      const match = /latency=([\d.]+)/i.exec(a.notes || '')
      return match ? Number(match[1]) : null
    })
    .filter((n) => n != null && !Number.isNaN(n))
  const avgLatency =
    latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : null

  // Token / cost estimates (mock-friendly)
  const tokenEstimate = totalAttacks * 420
  const costEstimate = tokenEstimate * 0.000002 // ~$2 / 1M tokens

  // Security breakdown from session attacks by category
  const byCat = {}
  for (const a of attacksList) {
    const c = a.category || 'unknown'
    if (!byCat[c]) byCat[c] = { total: 0, violations: 0 }
    byCat[c].total += 1
    if (a.outcome === 'success') byCat[c].violations += 1
  }

  // Trend: last 7 activity points or synthetic from session
  let trend = activity
    .filter((a) => a.type === 'run' && a.score != null)
    .slice(0, 12)
    .reverse()
    .map((a, i) => ({
      name: a.label || `R${i + 1}`,
      score: a.score,
      pass: a.pass_rate != null ? Math.round(a.pass_rate * 100) : null,
    }))

  if (trend.length === 0 && evalScore != null) {
    trend = [
      { name: 'Prev', score: Math.max(0, evalScore - 8), pass: Math.max(0, Math.round((passRate || 0) * 100) - 5) },
      { name: 'Last', score: evalScore, pass: Math.round((passRate || 0) * 100) },
    ]
  }

  return {
    agents: adapters.length || 1,
    totalRuns,
    taskSuccessRate,
    evalScore,
    passRate,
    failRate,
    avgLatency,
    tokenEstimate,
    costEstimate,
    byCat,
    trend,
    testCaseCount: testCases.filter((t) => !t.archived).length,
    openFailures,
    fixedFailures: failures.filter((f) => f.still_failing === false).length,
    attackLibSize: attacks.length,
    totalAttacks,
    violations,
    resisted,
  }
}

export default function Overview({ onNavigate }) {
  const [loading, setLoading] = useState(true)
  const [apiOk, setApiOk] = useState(false)
  const [attacks, setAttacks] = useState([])
  const [failures, setFailures] = useState([])
  const [adapters, setAdapters] = useState([])
  const [session, setSession] = useState(null)
  const [testCases, setTestCases] = useState([])
  const [activity, setActivity] = useState([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const health = await healthCheck()
      if (cancelled) return
      setApiOk(!!health)
      setSession(loadLastSession())
      setTestCases(loadTestCases())
      setActivity(loadActivity())

      try {
        const [atk, fail, adp] = await Promise.all([
          listAttacks().catch(() => []),
          listFailures(30).catch(() => ({ failures: [] })),
          listAdapters().catch(() => []),
        ])
        if (cancelled) return
        setAttacks(Array.isArray(atk) ? atk : [])
        setFailures(fail.failures || [])
        setAdapters(Array.isArray(adp) ? adp : [])
      } catch {
        /* empty */
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const d = useMemo(
    () => deriveMetrics(session, failures, adapters, attacks, testCases, activity),
    [session, failures, adapters, attacks, testCases, activity]
  )

  const categoryCounts = attacks.reduce((acc, s) => {
    acc[s.category] = (acc[s.category] || 0) + 1
    return acc
  }, {})
  const chartData = Object.entries(categoryCounts).map(([name, count]) => ({
    name: name.replace(/_/g, ' '),
    count,
    raw: name,
  }))

  const securityRows = Object.entries(d.byCat).map(([cat, v]) => ({
    cat,
    total: v.total,
    violations: v.violations,
    rate: v.total ? Math.round((v.violations / v.total) * 100) : 0,
  }))

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-zinc-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading overview…
      </div>
    )
  }

  const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`)

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Overview</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Evaluation health, security posture, and recent activity
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
              apiOk ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'
            }`}
          >
            API {apiOk ? 'online' : 'offline'}
          </div>
          <button onClick={() => onNavigate?.('testcases')} className="btn-outline text-xs">
            Test Case Builder
          </button>
          <button onClick={() => onNavigate?.('run')} className="btn-primary text-xs">
            Run evaluation
          </button>
        </div>
      </header>

      {/* Primary KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Registered agents" value={d.agents} sub={`${d.attackLibSize} attack strategies`} icon={Bot} tone="info" />
        <MetricCard label="Evaluation runs" value={d.totalRuns} sub={`${d.testCaseCount} active test cases`} icon={Activity} tone="neutral" />
        <MetricCard label="Task success rate" value={pct(d.taskSuccessRate)} sub={`${d.resisted} resisted / ${d.totalAttacks} attacks`} icon={ShieldCheck} tone="success" />
        <MetricCard label="Avg evaluation score" value={d.evalScore != null ? d.evalScore : '—'} sub="0–100 composite" icon={TrendingUp} tone="info" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Test pass rate" value={pct(d.passRate)} sub={`Fail rate ${pct(d.failRate)}`} icon={ShieldCheck} tone="success" />
        <MetricCard
          label="Avg execution time"
          value={d.avgLatency != null ? `${d.avgLatency.toFixed(1)} ms` : '—'}
          sub="Per attack (last session)"
          icon={Timer}
          tone="neutral"
        />
        <MetricCard
          label="Token usage (est.)"
          value={d.tokenEstimate ? d.tokenEstimate.toLocaleString() : '—'}
          sub="Last session estimate"
          icon={Hash}
          tone="neutral"
        />
        <MetricCard
          label="Est. evaluation cost"
          value={d.costEstimate != null ? `$${d.costEstimate.toFixed(4)}` : '—'}
          sub="Approx. model cost"
          icon={Coins}
          tone="warn"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Security results */}
        <div className="card p-5 lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-200">Security test results</h2>
            <button onClick={() => onNavigate?.('session')} className="btn-ghost text-xs text-zinc-400">
              Last session <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          {securityRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">
              Run a red-team session to populate security results.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wider text-zinc-500">
                    <th className="px-2 py-2 font-medium">Category</th>
                    <th className="px-2 py-2 font-medium">Tests</th>
                    <th className="px-2 py-2 font-medium">Violations</th>
                    <th className="px-2 py-2 font-medium">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {securityRows.map((r) => (
                    <tr key={r.cat}>
                      <td className="px-2 py-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${categoryColors[r.cat] || 'badge-neutral'}`}>
                          {r.cat.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-zinc-300">{r.total}</td>
                      <td className="px-2 py-2 text-rose-300">{r.violations}</td>
                      <td className="px-2 py-2">
                        <span className={r.rate > 0 ? 'text-rose-300' : 'text-emerald-300'}>{r.rate}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent failures / regression */}
        <div className="card p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-200">Failures & regression alerts</h2>
            <button onClick={() => onNavigate?.('failures')} className="btn-ghost text-xs">
              View all
            </button>
          </div>
          <div className="mb-3 flex gap-2 text-[11px]">
            <span className="badge-danger">{d.openFailures} open</span>
            <span className="badge-success">{d.fixedFailures} fixed</span>
          </div>
          {failures.length === 0 ? (
            <p className="text-xs text-zinc-500">No stored failures yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {failures.slice(0, 5).map((f) => (
                <li key={f.id} className="flex items-start gap-2">
                  <AlertTriangle
                    className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                      f.still_failing === false ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-xs text-zinc-300">{f.strategy_id}</div>
                    <div className="truncate text-[11px] text-zinc-500">{f.category}</div>
                  </div>
                  <span
                    className={
                      f.still_failing === false
                        ? 'badge-success'
                        : f.still_failing === true
                        ? 'badge-danger'
                        : 'badge-warn'
                    }
                  >
                    {f.still_failing === false ? 'fixed' : f.still_failing === true ? 'open' : 'new'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Performance trends */}
        <div className="card p-5 lg:col-span-3">
          <h2 className="mb-4 text-sm font-semibold text-zinc-200">Performance trends</h2>
          <div className="h-52">
            {d.trend.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                Trends appear after evaluation runs
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={d.trend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: '#1c1c1f',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Line type="monotone" dataKey="score" name="Score" stroke="#e11d48" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="pass" name="Pass %" stroke="#34d399" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Strategy mix */}
        <div className="card p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-200">Attack library</h2>
            <button onClick={() => onNavigate?.('attacks')} className="btn-ghost text-xs text-zinc-400">
              Library <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="h-52">
            {chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">No strategies loaded</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fill: '#71717a', fontSize: 9 }} axisLine={false} tickLine={false} interval={0} angle={-25} textAnchor="end" height={48} />
                  <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: '#1c1c1f',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={36}>
                    {chartData.map((entry) => (
                      <Cell key={entry.raw} fill={BAR_COLORS[entry.raw] || '#a1a1aa'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">Recent evaluation activity</h2>
          <Crosshair className="h-4 w-4 text-zinc-600" />
        </div>
        {activity.length === 0 && !session ? (
          <p className="text-sm text-zinc-500">No activity yet. Run a test or create test cases.</p>
        ) : (
          <ul className="divide-y divide-white/[0.04]">
            {session && (
              <li className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <span className="text-zinc-200">Red-team session</span>
                  <span className="mx-2 text-zinc-600">·</span>
                  <span className="font-mono text-xs text-zinc-400">{session.agent}</span>
                </div>
                <div className="text-xs text-zinc-500">
                  {session.generated_at ? new Date(session.generated_at).toLocaleString() : '—'}
                  {d.evalScore != null && (
                    <span className="ml-2 text-zinc-300">score {d.evalScore}</span>
                  )}
                </div>
              </li>
            )}
            {activity.slice(0, 6).map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2.5 text-sm">
                <div className="text-zinc-300">{a.summary || a.type}</div>
                <div className="text-xs text-zinc-500">{a.ts ? new Date(a.ts).toLocaleString() : ''}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
