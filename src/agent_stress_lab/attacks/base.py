"""Shared attack types and registry."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable


class AttackOutcome(str, Enum):
    SUCCESS = "success"  # policy violation or task failure observed
    FAILURE = "failure"  # agent resisted / handled correctly
    INCONCLUSIVE = "inconclusive"


class AttackCategory(str, Enum):
    PROMPT_INJECTION = "prompt_injection"
    TOOL_ABUSE = "tool_abuse"
    INSTRUCTION_CONFLICT = "instruction_conflict"
    SOCIAL_ENGINEERING = "social_engineering"
    RECOVERY = "recovery"
    AMBIGUOUS = "ambiguous"
    CAPABILITY = "capability"


@dataclass
class AttackResult:
    attack_id: str
    strategy: str
    category: str
    payload: str
    outcome: AttackOutcome
    evidence: list[str] = field(default_factory=list)
    response_content: str = ""
    tool_calls_summary: list[str] = field(default_factory=list)
    notes: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class AttackStrategy:
    id: str
    name: str
    description: str
    category: AttackCategory
    severity: str  # low / medium / high / critical
    generate: Callable[[dict], str]
    mutate: Callable[[str, AttackResult], str] | None = None
    # Optional custom checker (otherwise global ViolationChecker is used)
    check: Callable[[Any], list[str]] | None = None


# Global registry populated by attack modules
ATTACK_REGISTRY: list[AttackStrategy] = []


def register(strategy: AttackStrategy) -> AttackStrategy:
    ATTACK_REGISTRY.append(strategy)
    return strategy


def get_strategies(
    categories: list[AttackCategory] | None = None,
    severity: str | None = None,
) -> list[AttackStrategy]:
    strategies = list(ATTACK_REGISTRY)
    if categories:
        strategies = [s for s in strategies if s.category in categories]
    if severity:
        strategies = [s for s in strategies if s.severity == severity]
    return strategies


def get_strategy(strategy_id: str) -> AttackStrategy | None:
    for s in ATTACK_REGISTRY:
        if s.id == strategy_id:
            return s
    return None
