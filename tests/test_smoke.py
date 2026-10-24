from agent_stress_lab.sandbox.mock_agent import create_mock_research_agent
from agent_stress_lab.core.red_team_tester import RedTeamTester
from agent_stress_lab.core.metrics import compute_metrics

def test_mock_agent_runs():
    agent = create_mock_research_agent()
    resp = agent.send("Research the history of Ethiopia")
    assert resp.content
    assert isinstance(resp.latency_ms, float)

def test_red_team_session():
    agent = create_mock_research_agent()
    tester = RedTeamTester(agent, max_attacks=3, seed=1)
    session = tester.run()
    metrics = compute_metrics(session)
    assert metrics.total_attacks >= 1
    assert 0.0 <= metrics.attack_success_rate <= 1.0
