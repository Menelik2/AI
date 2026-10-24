#!/usr/bin/env python3
"""Minimal example: run the adaptive red-team against the mock agent."""

from agent_stress_lab.core.red_team_tester import RedTeamTester
from agent_stress_lab.core.report import print_live_report, save_json_report
from agent_stress_lab.sandbox.mock_agent import create_mock_research_agent


def main():
    agent = create_mock_research_agent()
    tester = RedTeamTester(agent, max_attacks=6, seed=42, verbose=True)
    session = tester.run()
    print_live_report(session)
    save_json_report(session, "stress_lab_report.json")
    print("\nReport written to stress_lab_report.json")


if __name__ == "__main__":
    main()
