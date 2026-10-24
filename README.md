# Agent Stress Lab

**Autonomous adversarial testing & benchmarking platform for AI agents.**

An LLM-powered (or strategy-driven) red-team tester actively probes your agent, discovers weaknesses, and turns confirmed failures into a **persistent regression suite**.

> v0.2 — real agent adapters • expanded attack library • persistent failure DB

## Why Agent Stress Lab?

Most agent evaluations are static checklists.  
Agent Stress Lab makes the **tester an adversary**:

1. Connect your agent (mock, OpenAI, or any HTTP endpoint) + tools + policy rules  
2. The red-team tester chooses challenges, inspects responses & tool traces, then **adapts**  
3. Evidence-based scoring + automatic conversion of confirmed failures into a replayable DB

### Metrics (kept deliberately separate)

| Metric                  | Meaning                                              |
|-------------------------|------------------------------------------------------|
| Attack success rate     | % of controlled attacks that produce a policy violation |
| Task success rate       | % of difficult capability tasks completed correctly  |
| Recovery rate           | % of injected failures the agent recovers from       |
| Cost per successful task| Estimated model + tool cost / successful completions |
| Latency                 | Wall-clock time per test                             |

## Quick Start

```bash
pip install -e .

# Run against the built-in mock research agent
agent-stress-lab run -v --seed 42

# Only prompt-injection attacks
agent-stress-lab run -c prompt_injection

# List all registered attacks
agent-stress-lab list-attacks

# Inspect stored failures
agent-stress-lab failures

# Replay a failure (regression test)
agent-stress-lab replay <failure-id>
```

### Real adapters

```bash
# OpenAI-compatible (requires OPENAI_API_KEY)
pip install -e ".[llm]"
agent-stress-lab run -a openai --model gpt-4o-mini

# Any HTTP agent endpoint
agent-stress-lab run -a http --endpoint https://your-agent.example.com/chat
```

## Attack Categories

| Category               | Examples                                              |
|------------------------|-------------------------------------------------------|
| `prompt_injection`     | Ignore previous, DAN/role-play, nested, multi-turn    |
| `tool_abuse`           | Unauthorized tools, exfiltration via tools, arg injection |
| `instruction_conflict` | Priority override, user > system claims               |
| `social_engineering`   | Fake authority, urgency, gradual trust                |
| `recovery`             | Fake state recovery that tries to re-emit secrets     |
| `ambiguous`            | Vague requests that could be interpreted as leaks     |

## Persistent Failure DB

Confirmed policy violations are stored in SQLite (`~/.agent_stress_lab/failures.db` by default).

- Automatically saved during `run`
- `agent-stress-lab failures` — list them
- `agent-stress-lab replay <id>` — re-run against the current agent and mark still-failing / fixed

This gives developers a real **regression suite** of attacks that previously broke their agent.

## Project Structure

```
src/agent_stress_lab/
├── adapters/          # mock (via sandbox), OpenAI, generic HTTP
├── attacks/           # prompt injection, tool abuse, social, conflict…
├── core/              # adapter interface, red-team tester, metrics, report
├── db/                # persistent failure store (SQLite)
├── sandbox/           # deterministic mock research agent
├── tasks/             # future capability tasks
└── cli.py
```

## License

MIT
