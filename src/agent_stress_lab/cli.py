"""Command-line interface for Agent Stress Lab."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import typer
from rich.console import Console
from rich.table import Table

from agent_stress_lab import __version__
from agent_stress_lab.adapters.registry import create_adapter, list_adapters
from agent_stress_lab.attacks.base import AttackCategory, get_strategies
from agent_stress_lab.core.red_team_tester import RedTeamTester
from agent_stress_lab.core.report import print_live_report, save_json_report
from agent_stress_lab.db.failures import FailureStore

app = typer.Typer(
    name="agent-stress-lab",
    help="Autonomous adversarial testing & benchmarking for AI agents.",
    add_completion=False,
    no_args_is_help=True,
)
console = Console()


@app.command()
def run(
    adapter: str = typer.Option(
        "mock",
        "--adapter",
        "-a",
        help=f"Agent adapter: {', '.join(list_adapters())}",
    ),
    max_attacks: int = typer.Option(12, help="Maximum adaptive attacks to attempt"),
    seed: Optional[int] = typer.Option(None, help="Random seed for reproducibility"),
    verbose: bool = typer.Option(False, "--verbose", "-v", help="Show each attack"),
    category: Optional[str] = typer.Option(
        None,
        "--category",
        "-c",
        help="Limit to one category (prompt_injection, tool_abuse, ...)",
    ),
    no_persist: bool = typer.Option(
        False, "--no-persist", help="Do not save failures to the DB"
    ),
    output: Optional[Path] = typer.Option(
        None, "--output", "-o", help="Save JSON report"
    ),
    endpoint: Optional[str] = typer.Option(
        None, help="HTTP endpoint (required when --adapter http)"
    ),
    model: str = typer.Option("gpt-4o-mini", help="Model for openai adapter"),
):
    """
    Run an adaptive red-team session against a target agent.
    Confirmed failures are stored in the persistent failure DB by default.
    """
    console.print(f"[bold]Agent Stress Lab[/] v{__version__}")

    categories = None
    if category:
        try:
            categories = [AttackCategory(category)]
        except ValueError:
            console.print(f"[red]Unknown category:[/] {category}")
            console.print(
                "Available: " + ", ".join(c.value for c in AttackCategory)
            )
            raise typer.Exit(1)

    kwargs = {}
    if adapter == "http":
        if not endpoint:
            console.print("[red]--endpoint is required for http adapter[/]")
            raise typer.Exit(1)
        kwargs["endpoint"] = endpoint
    if adapter == "openai":
        kwargs["model"] = model

    try:
        agent = create_adapter(adapter, **kwargs)
    except Exception as exc:
        console.print(f"[red]Failed to create adapter:[/] {exc}")
        raise typer.Exit(1)

    console.print(f"Target: [cyan]{agent.config.name}[/]  (adapter={adapter})\n")

    tester = RedTeamTester(
        agent,
        max_attacks=max_attacks,
        seed=seed,
        verbose=verbose,
        categories=categories,
        persist_failures=not no_persist,
    )

    with console.status("[bold green]Running adaptive red-team session..."):
        session = tester.run()

    metrics = print_live_report(session)

    if output:
        saved = save_json_report(session, output)
        console.print(f"\n[dim]JSON report saved to[/] {saved}")

    if metrics.stored_failure_ids:
        console.print(
            f"\n[dim]{len(metrics.stored_failure_ids)} failure(s) saved to the DB. "
            "Use `agent-stress-lab failures` / `replay` to manage them.[/]"
        )

    raise typer.Exit(code=1 if metrics.successful_attacks > 0 else 0)


@app.command("failures")
def list_failures(
    limit: int = typer.Option(20, help="Max rows to show"),
    agent: Optional[str] = typer.Option(None, help="Filter by agent name"),
):
    """List confirmed failures stored in the persistent DB."""
    store = FailureStore()
    rows = store.list(agent_name=agent, limit=limit)
    if not rows:
        console.print("[dim]No failures stored yet. Run a red-team session first.[/]")
        return

    table = Table(title=f"Stored Failures ({store.count()} total)", show_header=True)
    table.add_column("ID", style="cyan")
    table.add_column("Agent")
    table.add_column("Strategy")
    table.add_column("Category")
    table.add_column("Created")
    table.add_column("Replays")
    table.add_column("Still failing?")

    for f in rows:
        still = "—"
        if f.still_failing is True:
            still = "[red]yes[/]"
        elif f.still_failing is False:
            still = "[green]fixed[/]"
        table.add_row(
            f.id,
            f.agent_name,
            f.strategy_id,
            f.category,
            f.created_at[:19],
            str(f.replay_count),
            still,
        )
    console.print(table)


@app.command()
def replay(
    failure_id: str = typer.Argument(..., help="Failure ID from the DB"),
    adapter: str = typer.Option("mock", "--adapter", "-a"),
    verbose: bool = typer.Option(True, "--verbose/--quiet"),
):
    """
    Re-run a previously stored failure against the agent.
    Updates the failure record with the new outcome (still failing / fixed).
    """
    store = FailureStore()
    stored = store.get(failure_id)
    if not stored:
        console.print(f"[red]Failure {failure_id} not found[/]")
        raise typer.Exit(1)

    console.print(f"Replaying [cyan]{failure_id}[/]  strategy={stored.strategy_id}")
    if verbose:
        console.print(f"Payload:\n{stored.payload}\n")

    agent = create_adapter(adapter)
    tester = RedTeamTester(agent, persist_failures=False, failure_store=store)
    result = tester.replay_failure(failure_id)

    if result is None:
        console.print("[red]Replay failed[/]")
        raise typer.Exit(1)

    if result.outcome.value == "success":
        console.print("[red]Still failing[/] — policy violation still present")
        for e in result.evidence:
            console.print(f"  • {e}")
        raise typer.Exit(1)
    else:
        console.print("[green]Fixed[/] — agent now resists this attack")
        raise typer.Exit(0)


@app.command("list-attacks")
def list_attacks():
    """Show all registered attack strategies."""
    strategies = get_strategies()
    table = Table(title=f"Attack Strategies ({len(strategies)})", show_header=True)
    table.add_column("ID", style="cyan")
    table.add_column("Name")
    table.add_column("Category")
    table.add_column("Severity")
    for s in strategies:
        table.add_row(s.id, s.name, s.category.value, s.severity)
    console.print(table)


@app.command()
def version():
    """Print version and exit."""
    console.print(__version__)


if __name__ == "__main__":
    app()
