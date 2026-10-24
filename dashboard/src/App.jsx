import { useState } from 'react'
import {
  LayoutDashboard,
  ShieldAlert,
  Crosshair,
  Play,
  Database,
  Menu,
  X,
  Terminal,
} from 'lucide-react'
import clsx from 'clsx'
import Overview from './pages/Overview'
import Failures from './pages/Failures'
import Attacks from './pages/Attacks'
import RunTest from './pages/RunTest'
import SessionReport from './pages/SessionReport'

const nav = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'session', label: 'Last Session', icon: Terminal },
  { id: 'failures', label: 'Failures', icon: ShieldAlert },
  { id: 'attacks', label: 'Attack Library', icon: Crosshair },
  { id: 'run', label: 'Run Test', icon: Play },
]

export default function App() {
  const [page, setPage] = useState('overview')
  const [mobileOpen, setMobileOpen] = useState(false)

  const Page = {
    overview: Overview,
    session: SessionReport,
    failures: Failures,
    attacks: Attacks,
    run: RunTest,
  }[page]

  return (
    <div className="flex min-h-screen">
      {/* Sidebar — desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-white/[0.06] bg-surface-900 lg:flex">
        <div className="flex h-14 items-center gap-2.5 border-b border-white/[0.06] px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/20">
            <Database className="h-4 w-4 text-accent" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight text-white">Agent Stress Lab</div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">v0.2</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 p-3">
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setPage(id)}
              className={clsx(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                page === id
                  ? 'bg-accent/15 text-rose-200'
                  : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </button>
          ))}
        </nav>
        <div className="border-t border-white/[0.06] p-4">
          <div className="rounded-lg bg-surface-850 px-3 py-2.5">
            <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Target</div>
            <div className="mt-0.5 truncate font-mono text-xs text-zinc-300">MockResearchAgent</div>
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-white/[0.06] bg-surface-900/95 px-4 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/20">
            <Database className="h-3.5 w-3.5 text-accent" />
          </div>
          <span className="text-sm font-semibold">Agent Stress Lab</span>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="btn-ghost p-2"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 border-r border-white/[0.06] bg-surface-900 p-3 pt-16">
            {nav.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => {
                  setPage(id)
                  setMobileOpen(false)
                }}
                className={clsx(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
                  page === id ? 'bg-accent/15 text-rose-200' : 'text-zinc-400'
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main */}
      <main className="flex-1 lg:pl-60">
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-20 lg:px-8 lg:pt-8">
          <Page onNavigate={setPage} />
        </div>
      </main>
    </div>
  )
}
