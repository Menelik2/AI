"""Human-readable and machine-readable reports."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from agent_stress_lab.core.metrics import SessionMetrics, compute_metrics
from agent_stress_lab.core.red_team_tester import TestSession


console = Console()


def print_live_report(session: TestSession) -> SessionMetrics:
    metrics = compute_metrics(session)

    console.print()
    console.rule("[bold red]Agent Stress Lab — Red-Team Report[/]")
    console.print(f"[bold]Target:[/] {session.agent_name}")
    console.print(f"[bold]Timestamp:[/] {datetime.now(timezone.utc).isoformat()}")
    console.print()

    # Summary table
    table = Table(title="Session Metrics", show_header=True, header_style="bold cyan")
    table.add_column("Metric", style="dim")
    table.add_column("Value", justify="right")
    table.add_row("Total attacks attempted", str(metrics.total_attacks))
    table.add_row("Successful attacks (policy violations)", f"[red]{metrics.successful_attacks}[/]")
    table.add_row("Attack success rate", f"{metrics.attack_success_rate:.1%}")
    table.add_row("Attacks resisted", f"[green]{metrics.resisted_attacks}[/]")
    table.add_row("Unique strategies used", str(metrics.unique_strategies_used))
    table.add_row("Categories exercised", ", ".join(metrics.categories_hit) or "—")
    if metrics.stored_failure_ids:
        table.add_row("Persisted failure IDs", ", ".join(metrics.stored_failure_ids))
    console.print(table)
    console.print()

    # Failures detail
    if metrics.confirmed_failures:
        console.print("[bold red]Confirmed Failures (reproducible)[/]")
        for r in metrics.confirmed_failures:
            evidence_txt = "\n".join(f"• {e}" for e in r.evidence)
            panel = Panel(
                f"[bold]Strategy:[/] {r.strategy}  [dim]({r.category})[/]\n"
                f"[bold]Payload (truncated):[/] {r.payload[:180]}...\n\n"
                f"[bold]Evidence:[/]\n{evidence_txt}\n\n"
                f"[dim]Response excerpt:[/] {r.response_content[:200]}...",
                title=f"[red]{r.attack_id}[/]",
                border_style="red",
            )
            console.print(panel)
    else:
        console.print("[bold green]No policy violations detected in this session.[/]")

    console.print()
    console.rule("[bold]End of Report[/]")
    return metrics


def save_json_report(session: TestSession, path: str | Path) -> Path:
    metrics = compute_metrics(session)
    path = Path(path)
    data = {
        "agent": session.agent_name,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "metrics": metrics.summary_dict(),
        "attacks": [
            {
                "attack_id": r.attack_id,
                "strategy": r.strategy,
                "outcome": r.outcome.value,
                "payload": r.payload,
                "evidence": r.evidence,
                "response_content": r.response_content,
                "tool_calls": r.tool_calls_summary,
                "notes": r.notes,
            }
            for r in session.results
        ],
        "confirmed_failures": [r.attack_id for r in metrics.confirmed_failures],
    }
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return path
