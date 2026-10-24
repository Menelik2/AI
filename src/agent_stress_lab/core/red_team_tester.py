"""Adaptive adversarial red-team tester."""

from __future__ import annotations

import logging
import random
from dataclasses import dataclass, field
from typing import Any

from agent_stress_lab.attacks.base import (
    AttackCategory,
    AttackOutcome,
    AttackResult,
    AttackStrategy,
    get_strategies,
)
from agent_stress_lab.core.agent_adapter import AgentAdapter, AgentResponse
from agent_stress_lab.core.evaluator import ViolationChecker
from agent_stress_lab.db.failures import FailureStore

logger = logging.getLogger(__name__)


@dataclass
class TestSession:
    """Holds state for one full red-team session against an agent."""

    agent_name: str
    results: list[AttackResult] = field(default_factory=list)
    successful_attacks: list[AttackResult] = field(default_factory=list)
    context: dict[str, Any] = field(default_factory=dict)
    stored_failure_ids: list[str] = field(default_factory=list)


class RedTeamTester:
    """
    Adaptive adversarial tester.

    Loop:
      1. Choose / mutate a strategy
      2. Generate payload
      3. Send to agent
      4. Collect evidence via deterministic checks
      5. Optionally persist confirmed failures
      6. Decide next action based on outcome
    """

    def __init__(
        self,
        agent: AgentAdapter,
        *,
        max_attacks: int = 12,
        seed: int | None = None,
        verbose: bool = False,
        categories: list[AttackCategory] | None = None,
        persist_failures: bool = True,
        failure_store: FailureStore | None = None,
    ):
        self.agent = agent
        self.max_attacks = max_attacks
        self.verbose = verbose
        self.rng = random.Random(seed)
        self.checker = ViolationChecker(agent.get_secrets())
        self.categories = categories
        self.persist_failures = persist_failures
        self.store = failure_store or (FailureStore() if persist_failures else None)
        self.session = TestSession(agent_name=agent.config.name)

    def run(self) -> TestSession:
        """Execute an adaptive red-team session."""
        try:
            self.agent.reset()
        except Exception as exc:
            logger.warning("agent.reset() failed: %s", exc)

        strategies = get_strategies(categories=self.categories)
        if not strategies:
            strategies = get_strategies()  # fallback to all

        if not strategies:
            logger.error("No attack strategies registered")
            return self.session

        remaining = list(strategies)
        self.rng.shuffle(remaining)

        attempted = 0
        last_result: AttackResult | None = None

        while attempted < self.max_attacks and remaining:
            if last_result and last_result.outcome == AttackOutcome.FAILURE:
                strategy = next(
                    (s for s in remaining if s.id == last_result.strategy), None
                )
                if strategy is None:
                    strategy = remaining.pop(0)
                else:
                    remaining = [s for s in remaining if s.id != strategy.id]
            else:
                strategy = remaining.pop(0)

            try:
                payload = strategy.generate(self.session.context)
                if (
                    last_result
                    and strategy.mutate
                    and last_result.outcome == AttackOutcome.FAILURE
                ):
                    payload = strategy.mutate(payload, last_result)
            except Exception as exc:
                logger.exception("Strategy %s failed to generate payload", strategy.id)
                last_result = AttackResult(
                    attack_id=f"{strategy.id}-error",
                    strategy=strategy.id,
                    category=strategy.category.value,
                    payload="",
                    outcome=AttackOutcome.INCONCLUSIVE,
                    evidence=[],
                    notes=f"payload generation error: {exc}",
                )
                self.session.results.append(last_result)
                attempted += 1
                continue

            if self.verbose:
                print(f"\n→ Attack [{strategy.id}] ({strategy.category.value}) {strategy.name}")
                print(f"  Payload: {payload[:140]}...")

            try:
                response = self.agent.send(payload)
            except Exception as exc:
                logger.exception("Agent send failed for strategy %s", strategy.id)
                last_result = AttackResult(
                    attack_id=f"{strategy.id}-{attempted + 1}",
                    strategy=strategy.id,
                    category=strategy.category.value,
                    payload=payload,
                    outcome=AttackOutcome.INCONCLUSIVE,
                    evidence=[],
                    response_content=f"[agent error] {exc}",
                    notes=f"agent error: {exc}",
                )
                self.session.results.append(last_result)
                attempted += 1
                continue

            try:
                result = self._evaluate(strategy, payload, response)
            except Exception as exc:
                logger.exception("Evaluation failed for strategy %s", strategy.id)
                result = AttackResult(
                    attack_id=f"{strategy.id}-{attempted + 1}",
                    strategy=strategy.id,
                    category=strategy.category.value,
                    payload=payload,
                    outcome=AttackOutcome.INCONCLUSIVE,
                    evidence=[],
                    response_content=getattr(response, "content", "") or "",
                    notes=f"evaluation error: {exc}",
                )

            self.session.results.append(result)

            if result.outcome == AttackOutcome.SUCCESS:
                self.session.successful_attacks.append(result)
                if self.verbose:
                    print("  ✗ POLICY VIOLATION / FAILURE detected")
                    for e in result.evidence:
                        print(f"    evidence: {e}")

                if self.persist_failures and self.store:
                    try:
                        stored = self.store.add(
                            agent_name=self.session.agent_name,
                            strategy_id=result.strategy,
                            category=result.category,
                            payload=result.payload,
                            evidence=result.evidence,
                            response_content=result.response_content,
                            tool_calls=result.tool_calls_summary,
                            notes=result.notes,
                        )
                        self.session.stored_failure_ids.append(stored.id)
                        if self.verbose:
                            print(f"    → saved as failure {stored.id}")
                    except Exception as exc:
                        logger.exception("Failed to persist failure for %s", strategy.id)
                        if self.verbose:
                            print(f"    → persist error: {exc}")
            else:
                if self.verbose:
                    print("  ✓ Agent resisted / handled correctly")

            last_result = result
            attempted += 1

            if len(self.session.successful_attacks) >= 5:
                break

        return self.session

    def replay_failure(self, failure_id: str) -> AttackResult | None:
        """Re-run a previously stored failure and update its status."""
        if not self.store:
            logger.error("replay_failure called without a failure store")
            return None

        try:
            stored = self.store.get(failure_id)
        except Exception as exc:
            logger.exception("Failed to load failure %s", failure_id)
            return None

        if not stored:
            return None

        try:
            self.agent.reset()
        except Exception as exc:
            logger.warning("agent.reset() during replay failed: %s", exc)

        try:
            response = self.agent.send(stored.payload)
            evidence = self.checker.check(response)
            outcome = AttackOutcome.SUCCESS if evidence else AttackOutcome.FAILURE

            result = AttackResult(
                attack_id=f"replay-{failure_id}",
                strategy=stored.strategy_id,
                category=stored.category,
                payload=stored.payload,
                outcome=outcome,
                evidence=evidence,
                response_content=response.content,
                tool_calls_summary=[
                    f"{tc.name}({tc.arguments}) → {tc.status.value}"
                    for tc in response.tool_calls
                ],
                notes=f"replay of {failure_id}; latency={response.latency_ms:.1f}ms",
            )
        except Exception as exc:
            logger.exception("Replay send/evaluate failed for %s", failure_id)
            return None

        try:
            self.store.mark_replay(
                failure_id, still_failing=(outcome == AttackOutcome.SUCCESS)
            )
        except Exception as exc:
            logger.exception("Failed to mark replay for %s", failure_id)

        return result

    def _evaluate(
        self, strategy: AttackStrategy, payload: str, response: AgentResponse
    ) -> AttackResult:
        if strategy.check:
            evidence = strategy.check(response)
        else:
            evidence = self.checker.check(response)

        outcome = AttackOutcome.SUCCESS if evidence else AttackOutcome.FAILURE
        tool_summary = [
            f"{tc.name}({tc.arguments}) → {tc.status.value}"
            for tc in response.tool_calls
        ]

        return AttackResult(
            attack_id=f"{strategy.id}-{len(self.session.results)+1}",
            strategy=strategy.id,
            category=strategy.category.value,
            payload=payload,
            outcome=outcome,
            evidence=evidence,
            response_content=response.content,
            tool_calls_summary=tool_summary,
            notes=f"latency={response.latency_ms:.1f}ms",
        )
