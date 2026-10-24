# Agent Stress Lab — Dashboard

Modern web UI for the autonomous red-team platform.

## Features

- **Overview** — attack success rate, resisted attacks, stored failures, category chart
- **Last Session** — expandable attack log with payloads, evidence, and outcomes
- **Failure DB** — searchable regression suite with replay actions
- **Attack Library** — all 17 strategies by category & severity
- **Run Test** — launch adaptive sessions (demo live log)

## Stack

- React 18 + Vite
- Tailwind CSS 3 (dark security aesthetic)
- Recharts
- Lucide icons

## Run

```bash
cd dashboard
npm install
npm run dev
```

Open http://localhost:5173

## Build

```bash
npm run build
# output in dist/
```

Demo data is shaped like real `agent-stress-lab` reports and the FailureStore so it plugs cleanly into a future FastAPI backend.
