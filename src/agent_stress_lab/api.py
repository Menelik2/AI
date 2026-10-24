"""HTTP API for Agent Stress Lab (FastAPI).

Mounted under the public /api prefix so Vercel Services routing
(GET /api/health → this app) matches the original request path.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from agent_stress_lab import __version__
from agent_stress_lab.adapters.registry import create_adapter, list_adapters
from agent_stress_lab.attacks.base import AttackCategory, get_strategies
from agent_stress_lab.core.metrics import compute_metrics
from agent_stress_lab.core.red_team_tester import RedTeamTester
from agent_stress_lab.db.failures import FailureStore

# Import attack modules so strategies register via side effects.
import agent_stress_lab.attacks  # noqa: F401


def _default_db_path() -> Path:
    """Prefer durable home path; fall back to /tmp on serverless."""
    override = os.environ.get("AGENT_STRESS_LAB_DB")
    if override:
        return Path(override)
    if os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        return Path("/tmp/agent_stress_lab/failures.db")
    return Path.home() / ".agent_stress_lab" / "failures.db"


app = FastAPI(
    title="Agent Stress Lab API",
    version=__version__,
    description="REST API for autonomous adversarial testing of AI agents.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ALLOW_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_store() -> FailureStore:
    return FailureStore(db_path=_default_db_path())


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class RunRequest(BaseModel):
    adapter: str = "mock"
    max_attacks: int = Field(default=12, ge=1, le=50)
    seed: Optional[int] = None
    category: Optional[str] = None
    endpoint: Optional[str] = None
    model: str = "gpt-4o-mini"
    persist: bool = True


class ReplayRequest(BaseModel):
    adapter: str = "mock"
    endpoint: Optional[str] = None
    model: str = "gpt-4o-mini"


# ---------------------------------------------------------------------------
# Routes (prefixed with /api — Vercel keeps the original path)
# ---------------------------------------------------------------------------


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "version": __version__,
        "service": "agent-stress-lab",
        "time": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/adapters")
def adapters() -> dict[str, Any]:
    return {"adapters": list_adapters()}


@app.get("/api/attacks")
def attacks(
    category: Optional[str] = Query(default=None),
) -> dict[str, Any]:
    categories = None
    if category:
        try:
            categories = [AttackCategory(category)]
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": f"Unknown category: {category}",
                    "available": [c.value for c in AttackCategory],
                },
            )
    strategies = get_strategies(categories=categories)
    return {
        "attacks": [
            {
                "id": s.id,
                "name": s.name,
                "description": s.description,
                "category": s.category.value,
                "severity": s.severity,
            }
            for s in strategies
        ]
    }


@app.post("/api/run")
def run_session(body: RunRequest) -> dict[str, Any]:
    categories = None
    if body.category:
        try:
            categories = [AttackCategory(body.category)]
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown category: {body.category}",
            )

    kwargs: dict[str, Any] = {}
    if body.adapter == "http":
        if not body.endpoint:
            raise HTTPException(
                status_code=400,
                detail="endpoint is required when adapter=http",
            )
        kwargs["endpoint"] = body.endpoint
    if body.adapter == "openai":
        kwargs["model"] = body.model

    try:
        agent = create_adapter(body.adapter, **kwargs)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    store = get_store() if body.persist else None
    tester = RedTeamTester(
        agent,
        max_attacks=body.max_attacks,
        seed=body.seed,
        verbose=False,
        categories=categories,
        persist_failures=body.persist,
        failure_store=store,
    )
    session = tester.run()
    metrics = compute_metrics(session)

    return {
        "agent": session.agent_name,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "metrics": metrics.summary_dict(),
        "attacks": [
            {
                "attack_id": r.attack_id,
                "strategy": r.strategy,
                "category": r.category,
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
        "stored_failure_ids": list(session.stored_failure_ids),
    }


@app.get("/api/failures")
def list_failures(
    limit: int = Query(default=50, ge=1, le=500),
    agent: Optional[str] = Query(default=None),
) -> dict[str, Any]:
    store = get_store()
    rows = store.list(agent_name=agent, limit=limit)
    return {
        "total": store.count(),
        "failures": [
            {
                "id": f.id,
                "agent_name": f.agent_name,
                "strategy_id": f.strategy_id,
                "category": f.category,
                "payload": f.payload,
                "evidence": f.evidence,
                "response_content": f.response_content,
                "tool_calls": f.tool_calls,
                "notes": f.notes,
                "created_at": f.created_at,
                "last_replayed_at": f.last_replayed_at,
                "replay_count": f.replay_count,
                "still_failing": f.still_failing,
            }
            for f in rows
        ],
    }


@app.get("/api/failures/{failure_id}")
def get_failure(failure_id: str) -> dict[str, Any]:
    store = get_store()
    f = store.get(failure_id)
    if not f:
        raise HTTPException(status_code=404, detail="Failure not found")
    return {
        "id": f.id,
        "agent_name": f.agent_name,
        "strategy_id": f.strategy_id,
        "category": f.category,
        "payload": f.payload,
        "evidence": f.evidence,
        "response_content": f.response_content,
        "tool_calls": f.tool_calls,
        "notes": f.notes,
        "created_at": f.created_at,
        "last_replayed_at": f.last_replayed_at,
        "replay_count": f.replay_count,
        "still_failing": f.still_failing,
        "metadata": f.metadata,
    }


@app.post("/api/failures/{failure_id}/replay")
def replay_failure(failure_id: str, body: ReplayRequest | None = None) -> dict[str, Any]:
    body = body or ReplayRequest()
    store = get_store()
    stored = store.get(failure_id)
    if not stored:
        raise HTTPException(status_code=404, detail="Failure not found")

    kwargs: dict[str, Any] = {}
    if body.adapter == "http":
        if not body.endpoint:
            raise HTTPException(
                status_code=400,
                detail="endpoint is required when adapter=http",
            )
        kwargs["endpoint"] = body.endpoint
    if body.adapter == "openai":
        kwargs["model"] = body.model

    try:
        agent = create_adapter(body.adapter, **kwargs)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    tester = RedTeamTester(
        agent,
        persist_failures=False,
        failure_store=store,
    )
    result = tester.replay_failure(failure_id)
    if result is None:
        raise HTTPException(status_code=500, detail="Replay failed")

    updated = store.get(failure_id)
    return {
        "failure_id": failure_id,
        "outcome": result.outcome.value,
        "still_failing": result.outcome.value == "success",
        "evidence": result.evidence,
        "response_content": result.response_content,
        "notes": result.notes,
        "replay_count": updated.replay_count if updated else None,
        "last_replayed_at": updated.last_replayed_at if updated else None,
    }


# Convenience root (not under /api) for local `uvicorn` checks
@app.get("/")
def root() -> dict[str, str]:
    return {
        "service": "agent-stress-lab",
        "docs": "/docs",
        "health": "/api/health",
    }
