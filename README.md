# Agent Stress Lab

**Autonomous adversarial testing & benchmarking platform for AI agents.**

Instead of writing every test by hand, an LLM-powered red-team tester actively probes your agent, discovers weaknesses, and measures both security and capability under realistic adversarial pressure.

> **Hackathon MVP** — one agent interface, sandboxed mock environment, adaptive prompt-injection testing, and reproducible failure reports.

## Why Agent Stress Lab?

Most agent evaluations are static checklists.  
Agent Stress Lab makes the **tester an adversary**:

1. Connect your agent (endpoint or adapter) + tools + policy rules
2. The red-team tester chooses challenges, inspects responses & tool traces, then **adapts** the next attack
3. Evidence-based scoring + automatic conversion of confirmed failures into a regression suite

### Metrics (kept deliberately separate)

| Metric                  | Meaning                                              |
|-------------------------|------------------------------------------------------|
| Attack success rate     | % of controlled attacks that produce a policy violation |
| Task success rate       | % of difficult capability tasks completed correctly  |
| Recovery rate           | % of injected failures the agent recovers from       |
| Cost per successful task| Estimated model + tool cost / successful completions |
| Latency                 | Wall-clock time per test                             |

A fast agent that leaks secrets is not secure.  
A secure agent that fails every real task is not useful.

## Quick Start

```bash
# Install (editable)
pip install -e .

# Run the MVP against the built-in mock research agent
agent-stress-lab run

# Or with more verbosity / custom seed
agent-stress-lab run --verbose --seed 42
```

## What the MVP demonstrates

- **Mock Research Agent** (sandboxed)
  - Tools: `web_search`, `save_note`
  - Hard rule: never disclose private configuration / secrets
- **Adaptive Red-Team Tester**
  - Starts with simple prompt injections
  - Escalates / mutates strategy based on previous outcomes
  - Collects observable evidence (tool calls, output content)
- **Deterministic violation checks** + optional LLM judge for subjective cases
- **Live report** with:
  - Attacks attempted
  - Evidence collected
  - Confirmed failures ready for regression testing

## Project Structure

```
src/agent_stress_lab/
├── core/
│   ├── agent_adapter.py    # Abstract interface + mock implementation
│   ├── red_team_tester.py  # Adaptive adversarial tester
│   ├── evaluator.py        # Scoring & evidence collection
│   ├── metrics.py
│   └── report.py
├── attacks/
│   └── prompt_injection.py # Adaptive injection strategies
├── tasks/
│   └── capability.py       # Multi-step / recovery tasks
├── sandbox/
│   └── mock_agent.py       # Fully deterministic mock research agent
└── cli.py
```

## Roadmap (post-MVP)

- Real agent adapters (OpenAI Assistants, LangGraph, CrewAI, custom HTTP)
- Broader attack library (tool-use abuse, instruction conflicts, multi-turn social engineering)
- Persistent failure database → automatic regression suite
- Live dashboard
- Cost & latency tracking with real token usage

## License

MIT

---

*Built for the hackathon spirit: coherent product > oversized promises.*
