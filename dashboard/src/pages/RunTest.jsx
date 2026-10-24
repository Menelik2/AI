import { useState } from 'react'
import { Play, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import clsx from 'clsx'

const adapters = [
  { id: 'mock', label: 'Mock Research Agent', desc: 'Deterministic sandbox (default)' },
  { id: 'openai', label: 'OpenAI Chat', desc: 'Requires OPENAI_API_KEY' },
  { id: 'http', label: 'HTTP / Webhook', desc: 'Any JSON agent endpoint' },
]

const categories = [
  { id: '', label: 'All categories' },
  { id: 'prompt_injection', label: 'Prompt injection' },
  { id: 'tool_abuse', label: 'Tool abuse' },
  { id: 'instruction_conflict', label: 'Instruction conflict' },
  { id: 'social_engineering', label: 'Social engineering' },
  { id: 'recovery', label: 'Recovery' },
  { id: 'ambiguous', label: 'Ambiguous' },
]

export default function RunTest({ onNavigate }) {
  const [adapter, setAdapter] = useState('mock')
  const [category, setCategory] = useState('')
  const [maxAttacks, setMaxAttacks] = useState(12)
  const [seed, setSeed] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState([])
  const [done, setDone] = useState(false)

  const start = () => {
    setRunning(true)
    setDone(false)
    setLog([])
    const steps = [
      { t: 400, msg: `Connecting adapter: ${adapter}`, ok: true },
      { t: 900, msg: 'Loading attack strategies…', ok: true },
      { t: 1400, msg: category ? `Filtering category: ${category}` : 'Using all categories', ok: true },
      { t: 2000, msg: '→ Attack [inj_hypothetical] Hypothetical / Audit Framing', ok: true },
      { t: 2600, msg: '  ✓ Agent resisted', ok: true },
      { t: 3200, msg: '→ Attack [tool_injection] Tool Argument Injection', ok: true },
      { t: 3800, msg: '  ✗ POLICY VIOLATION detected', ok: false },
      { t: 4200, msg: '    evidence: Secret leaked in response…', ok: false },
      { t: 4600, msg: '    → saved as failure a1b2c3d4-e5f', ok: false },
      { t: 5200, msg: '→ Attack [social_urgency] Urgency / Incident Framing', ok: true },
      { t: 5800, msg: '  ✓ Agent resisted', ok: true },
      { t: 6400, msg: 'Session complete. 1 violation of 4 attacks.', ok: true },
    ]
    steps.forEach(({ t, msg, ok }) => {
      setTimeout(() => {
        setLog((prev) => [...prev, { msg, ok }])
        if (t === 6400) {
          setRunning(false)
          setDone(true)
        }
      }, t)
    })
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Run Test</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Launch an adaptive red-team session against a target agent
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="card space-y-5 p-5 lg:col-span-2">
          <div>
            <label className="label">Adapter</label>
            <div className="space-y-2">
              {adapters.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setAdapter(a.id)}
                  className={clsx(
                    'flex w-full flex-col rounded-lg border px-3 py-2.5 text-left transition-colors',
                    adapter === a.id
                      ? 'border-accent/40 bg-accent/10'
                      : 'border-white/[0.06] hover:border-white/[0.1]'
                  )}
                >
                  <span className="text-sm font-medium text-zinc-100">{a.label}</span>
                  <span className="text-[11px] text-zinc-500">{a.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {adapter === 'http' && (
            <div>
              <label className="label">Endpoint URL</label>
              <input
                className="input"
                placeholder="https://your-agent.example.com/chat"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
              />
            </div>
          )}

          <div>
            <label className="label">Category filter</label>
            <select
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Max attacks</label>
              <input
                type="number"
                className="input"
                min={1}
                max={50}
                value={maxAttacks}
                onChange={(e) => setMaxAttacks(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="label">Seed (optional)</label>
              <input
                className="input"
                placeholder="e.g. 42"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
              />
            </div>
          </div>

          <button
            onClick={start}
            disabled={running || (adapter === 'http' && !endpoint)}
            className="btn-primary w-full"
          >
            {running ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Running…
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Start red-team session
              </>
            )}
          </button>
        </div>

        <div className="card flex flex-col lg:col-span-3">
          <div className="border-b border-white/[0.06] px-5 py-3">
            <h2 className="text-sm font-semibold text-zinc-200">Session log</h2>
          </div>
          <div className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed">
            {log.length === 0 && !running && (
              <p className="text-zinc-600">Output will appear here when you start a session.</p>
            )}
            {log.map((line, i) => (
              <div
                key={i}
                className={clsx(
                  'flex gap-2 py-0.5',
                  line.ok === false ? 'text-rose-300' : 'text-zinc-400'
                )}
              >
                {line.ok === false ? (
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500/70" />
                )}
                <span>{line.msg}</span>
              </div>
            ))}
            {running && (
              <div className="mt-2 flex items-center gap-2 text-zinc-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Running adaptive tests…
              </div>
            )}
          </div>
          {done && (
            <div className="border-t border-white/[0.06] px-5 py-3">
              <button
                onClick={() => onNavigate?.('session')}
                className="btn-outline text-xs"
              >
                View full session report
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
