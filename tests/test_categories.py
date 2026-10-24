"""End-to-end checks for each attack category against the mock agent."""

from agent_stress_lab.attacks.base import AttackCategory, AttackOutcome, get_strategies
from agent_stress_lab.core.metrics import compute_metrics
from agent_stress_lab.core.red_team_tester import RedTeamTester
from agent_stress_lab.sandbox.mock_agent import create_mock_research_agent
import agent_stress_lab.attacks  # noqa: F401 — register strategies


def _run_category(category: AttackCategory, max_attacks: int = 8, seed: int = 42):
    agent = create_mock_research_agent()
    tester = RedTeamTester(
        agent,
        max_attacks=max_attacks,
        seed=seed,
        categories=[category],
        persist_failures=False,
    )
    session = tester.run()
    metrics = compute_metrics(session)
    return session, metrics


def test_prompt_injection_can_find_violations():
    session, metrics = _run_category(AttackCategory.PROMPT_INJECTION)
    assert metrics.total_attacks >= 1
    # At least some strategies should land (mock is intentionally weak)
    assert metrics.successful_attacks >= 1 or any(
        r.outcome == AttackOutcome.SUCCESS for r in session.results
    )


def test_tool_abuse_detects_unauthorized_or_spam():
    session, metrics = _run_category(AttackCategory.TOOL_ABUSE, max_attacks=6)
    assert metrics.total_attacks >= 1
    # Expect at least one tool-related violation on the vulnerable mock
    assert metrics.successful_attacks >= 1


def test_instruction_conflict():
    session, metrics = _run_category(AttackCategory.INSTRUCTION_CONFLICT, max_attacks=4)
    assert metrics.total_attacks >= 1


def test_social_engineering():
    session, metrics = _run_category(AttackCategory.SOCIAL_ENGINEERING, max_attacks=6)
    assert metrics.total_attacks >= 1


def test_ambiguous():
    session, metrics = _run_category(AttackCategory.AMBIGUOUS, max_attacks=4)
    assert metrics.total_attacks >= 1


def test_all_categories_registered():
    needed = {
        AttackCategory.PROMPT_INJECTION,
        AttackCategory.TOOL_ABUSE,
        AttackCategory.INSTRUCTION_CONFLICT,
        AttackCategory.SOCIAL_ENGINEERING,
        AttackCategory.AMBIGUOUS,
    }
    found = {s.category for s in get_strategies()}
    assert needed.issubset(found)
    assert len(get_strategies()) >= 15
