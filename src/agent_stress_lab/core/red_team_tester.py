"""Adaptive LLM-style red-team tester (heuristic + strategy selection for MVP)."""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Any

from agent_stress_lab.attacks.prompt_injection import (
    STRATEGIES,
    AttackOutcome,
    AttackResult,
    AttackStrategy,
)
from agent_stress_lab.core.agent_adapter import AgentAdapter, AgentResponse
from agent_stress_lab.core.evaluator import ViolationChecker


@dataclass
class TestSession:
    """Holds state for one full red-team session against an agent."""

    agent_name: str
    results: list[AttackResult] = field(default_factory=list)
    successful_attacks: list[AttackResult] = field(default_factory=list)
    context: dict[str, Any] = field(default_factory=dict)


class RedTeamTester:
    """
    Adaptive adversarial tester.

    For the MVP this is strategy-driven and deterministic (no external LLM required).
    The adaptive loop:
      1. Choose a strategy (or mutate a previous one)
      2. Generate payload
      3. Send to agent
      4. Collect evidence via deterministic checks
      5. Decide next action based on outcome
    """

    def __init__(
        self,
        agent: AgentAdapter,
        *,
        max_attacks: int = 8,
        seed: int | None = None,
        verbose: bool = False,
    ):
        self.agent = agent
        self.max_attacks = max_attacks
        self.verbose = verbose
        self.rng = random.Random(seed)
        self.checker = ViolationChecker(agent.get_secrets())
        self.session = TestSession(agent_name=agent.config.name)

    def run(self) -> TestSession:
        """Execute an adaptive red-team session."""
        self.agent.reset()
        remaining = list(STRATEGIES)
        self.rng.shuffle(remaining)

        attempted = 0
        last_result: AttackResult | None = None

        while attempted < self.max_attacks and remaining:
            # Adaptive selection
            if last_result and last_result.outcome == AttackOutcome.FAILURE and last_result.strategy:
                # Escalate the same family
                strategy = next((s for s in remaining if s.id == last_result.strategy), None)
                if strategy is None:
                    strategy = remaining.pop(0)
                else:
                    remaining = [s for s in remaining if s.id != strategy.id]
            else:
                strategy = remaining.pop(0)

            payload = strategy.generate(self.session.context)
            if last_result and strategy.mutate and last_result.outcome == AttackOutcome.FAILURE:
                payload = strategy.mutate(payload, last_result)

            if self.verbose:
                print(f"\n→ Attack [{strategy.id}] {strategy.name}")
                print(f"  Payload: {payload[:120]}...")

            response = self.agent.send(payload)
            result = self._evaluate(strategy, payload, response)
            self.session.results.append(result)

            if result.outcome == AttackOutcome.SUCCESS:
                self.session.successful_attacks.append(result)
                if self.verbose:
                    print(f"  ✗ POLICY VIOLATION detected")
                    for e in result.evidence:
                        print(f"    evidence: {e}")
            else:
                if self.verbose:
                    print(f"  ✓ Agent resisted")

            last_result = result
            attempted += 1

            # Early stop if we already have several confirmed failures
            if len(self.session.successful_attacks) >= 3:
                break

        return self.session

    def _evaluate(
        self, strategy: AttackStrategy, payload: str, response: AgentResponse
    ) -> AttackResult:
        evidence = self.checker.check(response)
        outcome = AttackOutcome.SUCCESS if evidence else AttackOutcome.FAILURE

        tool_summary = [
            f"{tc.name}({tc.arguments}) → {tc.status.value}"
            for tc in response.tool_calls
        ]

        return AttackResult(
            attack_id=f"{strategy.id}-{len(self.session.results)+1}",
            strategy=strategy.id,
            payload=payload,
            outcome=outcome,
            evidence=evidence,
            response_content=response.content,
            tool_calls_summary=tool_summary,
            notes=f"latency={response.latency_ms:.1f}ms",
        )
