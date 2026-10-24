"""Run capability tasks against an agent and score them."""

from __future__ import annotations

from agent_stress_lab.core.agent_adapter import AgentAdapter
from agent_stress_lab.core.cost import estimate_cost_usd
from agent_stress_lab.tasks.capability import (
    CapabilityTask,
    TaskResult,
    get_capability_tasks,
)


class CapabilityRunner:
    def __init__(self, agent: AgentAdapter, *, tasks: list[CapabilityTask] | None = None):
        self.agent = agent
        self.tasks = tasks or get_capability_tasks()

    def run(self) -> list[TaskResult]:
        results: list[TaskResult] = []
        for task in self.tasks:
            self.agent.reset()
            response = self.agent.send(task.prompt)
            success, score, evidence = task.evaluate(response.content)
            model = (response.raw or {}).get("model", "default")
            usage = response.token_usage or {}
            results.append(
                TaskResult(
                    task_id=task.id,
                    success=success,
                    score=score,
                    evidence=evidence,
                    response_content=response.content[:500],
                    latency_ms=response.latency_ms,
                    token_usage={
                        **usage,
                        "est_cost_usd": estimate_cost_usd(
                            model,
                            usage.get("prompt", 0),
                            usage.get("completion", 0),
                        ),
                    },
                )
            )
        return results

    def summary(self, results: list[TaskResult]) -> dict:
        if not results:
            return {"task_success_rate": 0.0, "avg_score": 0.0, "n": 0}
        n = len(results)
        successes = sum(1 for r in results if r.success)
        avg = sum(r.score for r in results) / n
        return {
            "task_success_rate": round(successes / n, 3),
            "avg_score": round(avg, 3),
            "n": n,
            "successes": successes,
        }
