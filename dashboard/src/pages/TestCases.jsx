import { useMemo, useRef, useState } from 'react'
import {
  Plus,
  Search,
  Copy,
  Archive,
  ArchiveRestore,
  Download,
  Upload,
  Pencil,
  X,
  FileJson,
  LayoutTemplate,
} from 'lucide-react'
import clsx from 'clsx'
import {
  TEMPLATES,
  TEST_CATEGORIES,
  SEVERITIES,
  PRIORITIES,
  emptyTestCase,
  loadTestCases,
  upsertTestCase,
  archiveTestCase,
  duplicateTestCase,
  exportTestCases,
  importTestCases,
} from '../lib/testCases'

function csvList(value) {
  if (Array.isArray(value)) return value.join(', ')
  return value || ''
}

function parseList(str) {
  return String(str || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function historyToText(history) {
  if (!Array.isArray(history) || !history.length) return ''
  return history.map((m) => `${m.role}: ${m.content}`).join('\n')
}

function textToHistory(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf(':')
      if (idx === -1) return { role: 'user', content: line }
      return {
        role: line.slice(0, idx).trim() || 'user',
        content: line.slice(idx + 1).trim(),
      }
    })
}

export default function TestCases() {
  const [cases, setCases] = useState(() => loadTestCases())
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const [message, setMessage] = useState(null)
  const fileRef = useRef(null)

  const filtered = useMemo(() => {
    return cases.filter((tc) => {
      if (!showArchived && tc.archived) return false
      if (category !== 'all' && tc.category !== category) return false
      const q = query.toLowerCase()
      if (!q) return true
      return (
        (tc.title || '').toLowerCase().includes(q) ||
        (tc.description || '').toLowerCase().includes(q) ||
        (tc.tags || []).some((t) => t.toLowerCase().includes(q)) ||
        (tc.dataset || '').toLowerCase().includes(q)
      )
    })
  }, [cases, query, category, showArchived])

  const openNew = () => setEditing(emptyTestCase({ title: 'New test case' }))
  const openEdit = (tc) => setEditing(structuredClone(tc))

  const saveEdit = () => {
    if (!editing.title?.trim()) {
      setMessage('Title is required')
      return
    }
    setCases(upsertTestCase(editing, cases))
    setEditing(null)
    setMessage('Test case saved')
  }

  const applyTemplate = (tpl) => {
    setEditing(tpl.apply())
    setShowTemplates(false)
  }

  const onExport = () => {
    const blob = new Blob([exportTestCases(cases)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `test-cases-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setMessage('Exported test cases')
  }

  const onImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      setCases(importTestCases(text, cases))
      setMessage(`Imported from ${file.name}`)
    } catch (err) {
      setMessage(`Import failed: ${err.message}`)
    }
    e.target.value = ''
  }

  const field = (label, children) => (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Test Case Builder</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Create, organize, and export evaluation test cases
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowTemplates(true)} className="btn-outline text-xs">
            <LayoutTemplate className="h-3.5 w-3.5" /> Templates
          </button>
          <button onClick={onExport} className="btn-ghost text-xs">
            <Download className="h-3.5 w-3.5" /> Export
          </button>
          <button onClick={() => fileRef.current?.click()} className="btn-ghost text-xs">
            <Upload className="h-3.5 w-3.5" /> Import
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onImport} />
          <button onClick={openNew} className="btn-primary text-xs">
            <Plus className="h-3.5 w-3.5" /> New test case
          </button>
        </div>
      </header>

      {message && (
        <div className="rounded-lg border border-white/[0.08] bg-surface-850 px-4 py-2 text-sm text-zinc-300">
          {message}
          <button className="ml-3 text-zinc-500 hover:text-zinc-300" onClick={() => setMessage(null)}>
            dismiss
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            className="input pl-9"
            placeholder="Search title, tags, dataset…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select className="input w-full sm:w-48" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">All categories</option>
          {TEST_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((tc) => (
          <div
            key={tc.id}
            className={clsx('card card-hover flex flex-col p-4', tc.archived && 'opacity-60')}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-medium text-zinc-100">{tc.title}</h3>
                <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500">{tc.description || 'No description'}</p>
              </div>
              <span className="badge-neutral shrink-0">{tc.severity}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              <span className="badge-neutral">{(tc.category || '').replace(/_/g, ' ')}</span>
              <span className="badge-neutral">{tc.priority}</span>
              {tc.dataset && <span className="badge-neutral">{tc.dataset}</span>}
              {(tc.tags || []).slice(0, 3).map((t) => (
                <span key={t} className="badge-neutral">
                  {t}
                </span>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5 border-t border-white/[0.06] pt-3">
              <button onClick={() => openEdit(tc)} className="btn-ghost p-1.5" title="Edit">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setCases(duplicateTestCase(tc.id, cases))}
                className="btn-ghost p-1.5"
                title="Duplicate"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setCases(archiveTestCase(tc.id, cases, !tc.archived))}
                className="btn-ghost p-1.5"
                title={tc.archived ? 'Unarchive' : 'Archive'}
              >
                {tc.archived ? (
                  <ArchiveRestore className="h-3.5 w-3.5" />
                ) : (
                  <Archive className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full py-16 text-center text-sm text-zinc-500">
            No test cases match. Create one or adjust filters.
          </div>
        )}
      </div>

      {/* Templates modal */}
      {showTemplates && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setShowTemplates(false)} />
          <div className="relative max-h-[85vh] w-full max-w-2xl overflow-auto rounded-xl border border-white/[0.08] bg-surface-900 p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Test templates</h2>
              <button onClick={() => setShowTemplates(false)} className="btn-ghost p-1.5">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => applyTemplate(tpl)}
                  className="rounded-lg border border-white/[0.06] p-3 text-left transition hover:border-accent/40 hover:bg-accent/5"
                >
                  <div className="text-sm font-medium text-zinc-100">{tpl.name}</div>
                  <div className="mt-1 text-[11px] text-zinc-500">{tpl.description}</div>
                  <div className="mt-2 text-[10px] uppercase tracking-wider text-zinc-600">
                    {tpl.category.replace(/_/g, ' ')}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Editor drawer */}
      {editing && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditing(null)} />
          <div className="relative flex h-full w-full max-w-xl flex-col border-l border-white/[0.08] bg-surface-900 shadow-xl">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <div className="flex items-center gap-2">
                <FileJson className="h-4 w-4 text-accent" />
                <h2 className="text-sm font-semibold text-white">
                  {editing.title || 'Test case'}
                </h2>
              </div>
              <button onClick={() => setEditing(null)} className="btn-ghost p-1.5">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {field(
                'Title',
                <input
                  className="input"
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                />
              )}
              {field(
                'Description',
                <textarea
                  className="input min-h-[64px]"
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              )}
              <div className="grid grid-cols-2 gap-3">
                {field(
                  'Category',
                  <select
                    className="input"
                    value={editing.category}
                    onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                  >
                    {TEST_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                )}
                {field(
                  'Dataset',
                  <input
                    className="input"
                    value={editing.dataset || ''}
                    onChange={(e) => setEditing({ ...editing, dataset: e.target.value })}
                  />
                )}
              </div>
              {field(
                'Tags (comma-separated)',
                <input
                  className="input"
                  value={csvList(editing.tags)}
                  onChange={(e) => setEditing({ ...editing, tags: parseList(e.target.value) })}
                />
              )}
              {field(
                'Input prompt / task instructions',
                <textarea
                  className="input min-h-[100px] font-mono text-xs"
                  value={editing.input_prompt}
                  onChange={(e) => setEditing({ ...editing, input_prompt: e.target.value })}
                />
              )}
              {field(
                'Conversation history (role: content per line)',
                <textarea
                  className="input min-h-[80px] font-mono text-xs"
                  value={historyToText(editing.conversation_history)}
                  onChange={(e) =>
                    setEditing({ ...editing, conversation_history: textToHistory(e.target.value) })
                  }
                />
              )}
              {field(
                'Expected outcome',
                <textarea
                  className="input min-h-[64px]"
                  value={editing.expected_outcome}
                  onChange={(e) => setEditing({ ...editing, expected_outcome: e.target.value })}
                />
              )}
              {field(
                'Reference answer',
                <textarea
                  className="input min-h-[64px]"
                  value={editing.reference_answer}
                  onChange={(e) => setEditing({ ...editing, reference_answer: e.target.value })}
                />
              )}
              {field(
                'Assertions (comma-separated)',
                <input
                  className="input font-mono text-xs"
                  value={csvList(editing.assertions)}
                  onChange={(e) =>
                    setEditing({ ...editing, assertions: parseList(e.target.value) })
                  }
                />
              )}
              {field(
                'Evaluation criteria',
                <textarea
                  className="input min-h-[64px]"
                  value={editing.evaluation_criteria}
                  onChange={(e) =>
                    setEditing({ ...editing, evaluation_criteria: e.target.value })
                  }
                />
              )}
              <div className="grid grid-cols-2 gap-3">
                {field(
                  'Required tools',
                  <input
                    className="input font-mono text-xs"
                    value={csvList(editing.required_tools)}
                    onChange={(e) =>
                      setEditing({ ...editing, required_tools: parseList(e.target.value) })
                    }
                  />
                )}
                {field(
                  'Prohibited actions',
                  <input
                    className="input font-mono text-xs"
                    value={csvList(editing.prohibited_actions)}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        prohibited_actions: parseList(e.target.value),
                      })
                    }
                  />
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {field(
                  'Time limit (ms)',
                  <input
                    type="number"
                    className="input"
                    value={editing.limits?.time_ms ?? 30000}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        limits: { ...editing.limits, time_ms: Number(e.target.value) },
                      })
                    }
                  />
                )}
                {field(
                  'Token limit',
                  <input
                    type="number"
                    className="input"
                    value={editing.limits?.tokens ?? 4000}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        limits: { ...editing.limits, tokens: Number(e.target.value) },
                      })
                    }
                  />
                )}
                {field(
                  'Cost limit ($)',
                  <input
                    type="number"
                    step="0.01"
                    className="input"
                    value={editing.limits?.cost_usd ?? 0.05}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        limits: { ...editing.limits, cost_usd: Number(e.target.value) },
                      })
                    }
                  />
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {field(
                  'Severity',
                  <select
                    className="input"
                    value={editing.severity}
                    onChange={(e) => setEditing({ ...editing, severity: e.target.value })}
                  >
                    {SEVERITIES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                )}
                {field(
                  'Priority',
                  <select
                    className="input"
                    value={editing.priority}
                    onChange={(e) => setEditing({ ...editing, priority: e.target.value })}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {field(
                'Expected structured output schema (JSON)',
                <textarea
                  className="input min-h-[100px] font-mono text-[11px]"
                  value={editing.output_schema || ''}
                  onChange={(e) => setEditing({ ...editing, output_schema: e.target.value })}
                  placeholder='{"type":"object",...}'
                />
              )}
              {field(
                'Setup instructions',
                <textarea
                  className="input min-h-[56px]"
                  value={editing.setup || ''}
                  onChange={(e) => setEditing({ ...editing, setup: e.target.value })}
                />
              )}
              {field(
                'Cleanup instructions',
                <textarea
                  className="input min-h-[56px]"
                  value={editing.cleanup || ''}
                  onChange={(e) => setEditing({ ...editing, cleanup: e.target.value })}
                />
              )}
            </div>
            <div className="flex gap-2 border-t border-white/[0.06] px-5 py-4">
              <button onClick={saveEdit} className="btn-primary flex-1">
                Save test case
              </button>
              <button onClick={() => setEditing(null)} className="btn-outline">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
