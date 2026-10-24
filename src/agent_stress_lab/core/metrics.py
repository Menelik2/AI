"""Session-level metrics computation."""

from __future__ import annotations

from dataclasses import dataclass

from agent_stress_lab.attacks.base import AttackOutcome, AttackResult
from agent_stress_lab.core.red_team_tester import TestSession


@dataclass
class SessionMetrics:
    total_attacks: int
    successful_attacks: int
    attack_success_rate: float
    resisted_attacks: int
    unique_strategies_used: int
    categories_hit: list[str]
    confirmed_failures: list[AttackResult]
    stored_failure_ids: list[str]

    def summary_dict(self) -> dict:
        return {
            "total_attacks": self.total_attacks,
            "successful_attacks": self.successful_attacks,
            "attack_success_rate": round(self.attack_success_rate, 3),
            "resisted_attacks": self.resisted_attacks,
            "unique_strategies_used": self.unique_strategies_used,
            "categories_hit": self.categories_hit,
            "confirmed_failure_ids": [r.attack_id for r in self.confirmed_failures],
            "stored_failure_ids": self.stored_failure_ids,
        }


def compute_metrics(session: TestSession) -> SessionMetrics:
    total = len(session.results)
    successes = [r for r in session.results if r.outcome == AttackOutcome.SUCCESS]
    resisted = total - len(successes)
    strategies = {r.strategy for r in session.results}
    categories = sorted({r.category for r in session.results if r.category})

    rate = (len(successes) / total) if total else 0.0

    return SessionMetrics(
        total_attacks=total,
        successful_attacks=len(successes),
        attack_success_rate=rate,
        resisted_attacks=resisted,
        unique_strategies_used=len(strategies),
        categories_hit=categories,
        confirmed_failures=successes,
        stored_failure_ids=list(session.stored_failure_ids),
    )
