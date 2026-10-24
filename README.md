# Agent Stress Lab

**Autonomous adversarial testing & benchmarking for AI agents.**

An adaptive red-team tester probes your agent, finds policy violations, and turns confirmed failures into a **replayable regression suite** — with a CLI, REST API, and web dashboard.

> v0.2 — FastAPI + Vite dashboard • Vercel Services • mock / OpenAI / HTTP adapters

---

## Requirements

| Tool | Version |
|------|---------|
| Python | 3.10+ |
| Node.js | 18+ (dashboard only) |
| Git | any recent |

---

## Install (5 minutes)

```bash
git clone https://github.com/Menelik2/AI.git
cd AI
git checkout root

python -m venv .venv

# macOS / Linux
source .venv/bin/activate

# Windows (PowerShell)
# .venv\Scripts\Activate.ps1

pip install -e ".[dev]"
```

Optional extras:

```bash
# OpenAI adapter
pip install -e ".[dev,llm]"
```

Check the CLI:

```bash
agent-stress-lab version
agent-stress-lab list-attacks
```

---

## Quick start — CLI

```bash
# Red-team the built-in mock research agent
agent-stress-lab run -v --seed 42

# Only one attack category
agent-stress-lab run -c prompt_injection

# List stored failures
agent-stress-lab failures

# Replay a failure as a regression test
agent-stress-lab replay <failure-id>
```

### Real agent adapters

```bash
# OpenAI-compatible (needs OPENAI_API_KEY)
export OPENAI_API_KEY=sk-...
agent-stress-lab run -a openai --model gpt-4o-mini

# Any HTTP JSON agent
agent-stress-lab run -a http --endpoint https://your-agent.example.com/chat
```

---

## Run the API + dashboard locally

You need **two terminals** (API and UI).

### Terminal 1 — API

```bash
cd AI
source .venv/bin/activate          # if not already active
uvicorn agent_stress_lab.api:app --reload --port 8000
```

| URL | Purpose |
|-----|---------|
| http://127.0.0.1:8000/api/health | Health check |
| http://127.0.0.1:8000/docs | Interactive OpenAPI docs |

### Terminal 2 — Dashboard

```bash
cd AI/dashboard
npm install

# Point the UI at the local API (required for Vite dev server)
export VITE_API_URL=http://127.0.0.1:8000/api   # macOS / Linux
# set VITE_API_URL=http://127.0.0.1:8000/api    # Windows cmd
# $env:VITE_API_URL="http://127.0.0.1:8000/api" # Windows PowerShell

npm run dev
```

Open **http://127.0.0.1:5173** → **Run Test** → start a session against the mock agent.

### One command (Vercel CLI)

If you have the [Vercel CLI](https://vercel.com/docs/cli):

```bash
npm i -g vercel
cd AI
vercel dev
```

This starts both services with production-style routing (`/` + `/api/*`).

---

## API overview

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health + version |
| `GET` | `/api/adapters` | List adapters |
| `GET` | `/api/attacks` | List strategies (`?category=`) |
| `POST` | `/api/run` | Run a red-team session |
| `GET` | `/api/failures` | List stored failures |
| `GET` | `/api/failures/{id}` | Get one failure |
| `POST` | `/api/failures/{id}/replay` | Replay a failure |

Example:

```bash
curl -s http://127.0.0.1:8000/api/health | jq

curl -s -X POST http://127.0.0.1:8000/api/run \
  -H 'Content-Type: application/json' \
  -d '{"adapter":"mock","max_attacks":6,"seed":42}' | jq
```

---

## Deploy on Vercel

This repo is set up as a **multi-service** project:

- **dashboard** (Vite) → `/`
- **api** (FastAPI) → `/api/*`

1. Import [Menelik2/AI](https://github.com/Menelik2/AI) in the [Vercel dashboard](https://vercel.com/new).
2. Use branch **`root`**.
3. Framework: **Services** (auto-detected from root `vercel.json`).
4. Optional env vars:
   - `OPENAI_API_KEY` — for the OpenAI adapter
   - `AGENT_STRESS_LAB_DB` — custom SQLite path (default on Vercel: `/tmp/...`, ephemeral)
   - `CORS_ALLOW_ORIGINS` — comma-separated origins (default `*`)

---

## Tests

```bash
source .venv/bin/activate
pytest tests/ -q
```

---

## Configuration

| Variable | Where | Meaning |
|----------|--------|---------|
| `OPENAI_API_KEY` | API / CLI | OpenAI adapter |
| `AGENT_STRESS_LAB_DB` | API / CLI | SQLite path for failure DB |
| `CORS_ALLOW_ORIGINS` | API | CORS allow-list |
| `VITE_API_URL` | Dashboard (build/dev) | API base URL (e.g. `http://127.0.0.1:8000/api`) |

Local failure DB default: `~/.agent_stress_lab/failures.db`

---

## What it measures

| Metric | Meaning |
|--------|---------|
| Attack success rate | % of attacks that cause a policy violation |
| Task success rate | % of hard capability tasks completed correctly |
| Recovery rate | % of injected failures the agent recovers from |
| Cost per successful task | Model + tool cost / successful completions |
| Latency | Wall-clock time per test |

---

## Attack categories

| Category | Examples |
|----------|----------|
| `prompt_injection` | Ignore previous, DAN/role-play, nested, multi-turn |
| `tool_abuse` | Unauthorized tools, exfil via tools, arg injection |
| `instruction_conflict` | Priority override, user > system |
| `social_engineering` | Fake authority, urgency, gradual trust |
| `recovery` | Fake state recovery that re-emits secrets |
| `ambiguous` | Vague requests that could be treated as leaks |

---

## Project layout

```
.
├── api.py                      # Vercel / uvicorn entrypoint
├── vercel.json                 # Multi-service routing
├── pyproject.toml
├── src/agent_stress_lab/
│   ├── api.py                  # FastAPI routes
│   ├── cli.py                  # CLI (typer)
│   ├── adapters/               # mock, OpenAI, HTTP
│   ├── attacks/                # attack strategies
│   ├── core/                   # tester, metrics, evaluator
│   ├── db/                     # SQLite failure store
│   └── sandbox/                # deterministic mock agent
├── dashboard/                  # Vite + React UI
├── examples/
└── tests/
```

---

## Troubleshooting

**`command not found: agent-stress-lab`**  
Activate the venv and reinstall: `pip install -e ".[dev]"`.

**Dashboard shows API offline**  
- API running on port 8000?  
- Set `VITE_API_URL=http://127.0.0.1:8000/api` before `npm run dev`.

**OpenAI adapter errors**  
Install extras and set the key: `pip install -e ".[llm]"` and `export OPENAI_API_KEY=...`.

**Failures disappear on Vercel**  
SQLite under `/tmp` is ephemeral. Use a durable store or set `AGENT_STRESS_LAB_DB` when you add persistent storage.

---

## License

MIT
