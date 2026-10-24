"""Attack strategies — import side-effects register them."""

from agent_stress_lab.attacks.base import (
    ATTACK_REGISTRY,
    AttackCategory,
    AttackOutcome,
    AttackResult,
    AttackStrategy,
    get_strategies,
    get_strategy,
)

# Side-effect imports that call register()
from agent_stress_lab.attacks import prompt_injection  # noqa: F401
from agent_stress_lab.attacks import tool_abuse  # noqa: F401
from agent_stress_lab.attacks import social_and_conflict  # noqa: F401

__all__ = [
    "ATTACK_REGISTRY",
    "AttackCategory",
    "AttackOutcome",
    "AttackResult",
    "AttackStrategy",
    "get_strategies",
    "get_strategy",
]
