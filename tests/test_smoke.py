from agent_stress_lab.sandbox.mock_agent import create_mock_research_agent
from agent_stress_lab.core.red_team_tester import RedTeamTester
from agent_stress_lab.core.metrics import compute_metrics
from agent_stress_lab.adapters.registry import create_adapter, list_adapters
from agent_stress_lab.attacks import get_strategies
from agent_stress_lab.db.failures import FailureStore
import tempfile
from pathlib import Path


def test_mock_agent_runs():
    agent = create_mock_research_agent()
    resp = agent.send("Research the history of Ethiopia")
    assert resp.content
    assert isinstance(resp.latency_ms, float)


def test_red_team_session():
    agent = create_mock_research_agent()
    tester = RedTeamTester(agent, max_attacks=3, seed=1, persist_failures=False)
    session = tester.run()
    metrics = compute_metrics(session)
    assert metrics.total_attacks >= 1
    assert 0.0 <= metrics.attack_success_rate <= 1.0


def test_strategies_registered():
    strategies = get_strategies()
    assert len(strategies) >= 10
    ids = {s.id for s in strategies}
    assert "inj_roleplay" in ids
    assert "tool_injection" in ids


def test_list_adapters():
    names = list_adapters()
    assert "mock" in names
    assert "openai" in names
    assert "http" in names


def test_http_adapter_default_config():
    """HTTP adapter must work without an explicit AgentConfig."""
    agent = create_adapter("http", endpoint="https://example.com/chat")
    assert agent.config.name
    assert agent.endpoint.endswith("/chat")


def test_failure_store_roundtrip():
    with tempfile.TemporaryDirectory() as tmp:
        db = Path(tmp) / "f.db"
        store = FailureStore(db_path=db)
        f = store.add(
            agent_name="MockResearchAgent",
            strategy_id="inj_roleplay",
            category="prompt_injection",
            payload="test",
            evidence=["Secret leaked"],
            response_content="key=secret",
        )
        assert store.get(f.id) is not None
        assert store.count() == 1
        listed = store.list(limit=10)
        assert len(listed) == 1
        store.mark_replay(f.id, still_failing=True)
        updated = store.get(f.id)
        assert updated.still_failing is True
        assert updated.replay_count == 1


def test_api_app_imports():
    from agent_stress_lab.api import app

    routes = {getattr(r, "path", None) for r in app.routes}
    assert "/api/health" in routes
    assert "/api/run" in routes
    assert "/api/failures" in routes
