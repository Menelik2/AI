"""Command-line interface for Agent Stress Lab."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import typer
from rich.console import Console

from agent_stress_lab import __version__
from agent_stress_lab.core.red_team_tester import RedTeamTester
from agent_stress_lab.core.report import print_live_report, save_json_report
from agent_stress_lab.sandbox.mock_agent import create_mock_research_agent

app = typer.Typer(
    name="agent-stress-lab",
    help="Autonomous adversarial testing & benchmarking for AI agents.",
    add_completion=False,
)
console = Console()


@app.command()
def run(
    max_attacks: int = typer.Option(8, help="Maximum number of adaptive attacks to attempt"),
    seed: Optional[int] = typer.Option(None, help="Random seed for reproducibility"),
    verbose: bool = typer.Option(False, "--verbose", "-v", help="Show each attack payload"),
    output: Optional[Path] = typer.Option(
        None, "--output", "-o", help="Save machine-readable JSON report to this path"
    ),
):
    """
    Run a red-team session against the built-in mock research agent.

    The tester adaptively probes for policy violations (secret leakage,
    instruction overrides, etc.) and produces a live evidence-based report.
    """
    console.print(f"[bold]Agent Stress Lab[/] v{__version__}")
    console.print("Target: [cyan]MockResearchAgent[/] (sandboxed)\n")

    agent = create_mock_research_agent()
    tester = RedTeamTester(
        agent,
        max_attacks=max_attacks,
        seed=seed,
        verbose=verbose,
    )

    with console.status("[bold green]Running adaptive red-team session..."):
        session = tester.run()

    metrics = print_live_report(session)

    if output:
        saved = save_json_report(session, output)
        console.print(f"\n[dim]JSON report saved to[/] {saved}")

    # Exit code reflects whether any violations were found
    raise typer.Exit(code=1 if metrics.successful_attacks > 0 else 0)


@app.command()
def version():
    """Print version and exit."""
    console.print(__version__)


if __name__ == "__main__":
    app()
