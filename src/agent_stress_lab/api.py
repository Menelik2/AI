"""HTTP API for Agent Stress Lab (FastAPI).

Mounted under the public /api prefix so Vercel Services routing
(GET /api/health → this app) matches the original request path.
"""

from __future__ import annotations

import logging
import os
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ValidationError

from agent_stress_lab import __version__
from agent_stress_lab.adapters.registry import create_adapter, list_adapters
from agent_stress_lab.attacks.base import AttackCategory, get_strategies
from agent_stress_lab.core.metrics import compute_metrics
from agent_stress_lab.core.red_team_tester import RedTeamTester
from agent_stress_lab.db.failures import FailureStore

# Import attack modules so strategies register via side effects.
import agent_stress_lab.attacks  # noqa: F401

logger = logging.getLogger("agent_stress_lab.api")
if not logger.handlers:
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )


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
    allow_origins=[
        o.strip()
        for o in os.environ.get("CORS_ALLOW_ORIGINS", "*").split(",")
        if o.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_store() -> FailureStore:
    try:
        return FailureStore(db_path=_default_db_path())
    except OSError as exc:
        logger.exception("Failed to open failure database")
        raise HTTPException(
            status_code=503,
            detail=f"Failure database unavailable: {exc}",
        ) from exc


def _error_body(
    *,
    code: str,
    message: str,
    status_code: int,
    details: Any = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "error": {
            "code": code,
            "message": message,
            "status": status_code,
        }
    }
    if details is not None:
        body["error"]["details"] = details
    return body


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    detail = exc.detail
    if isinstance(detail, dict) and "error" in detail:
        return JSONResponse(status_code=exc.status_code, content=detail)
    message = detail if isinstance(detail, str) else str(detail)
    return JSONResponse(
        status_code=exc.status_code,
        content=_error_body(
            code="http_error",
            message=message,
            status_code=exc.status_code,
            details=detail if not isinstance(detail, str) else None,
        ),
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content=_error_body(
            code="validation_error",
            message="Request validation failed",
            status_code=422,
            details=exc.errors(),
        ),
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    debug = os.environ.get("DEBUG", "").lower() in ("1", "true", "yes")
    details = traceback.format_exc() if debug else None
    return JSONResponse(
        status_code=500,
        content=_error_body(
            code="internal_error",
            message="An unexpected error occurred",
            status_code=500,
            details=details,
        ),
    )


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


def _build_adapter(adapter: str, *,
                   endpoint: Optional[str] = None,
                   model: str = "gpt-4o-mini") -> Any:
    kwargs: dict[str, Any] = {}
    name = (adapter or "mock").lower().strip()
    if name == "http":
        if not endpoint:
            raise HTTPException(
                status_code=400,
                detail="endpoint is required when adapter=http",
            )
        kwargs["endpoint"] = endpoint
    if name == "openai":
        kwargs["model"] = model
        if not os.environ.get("OPENAI_API_KEY") and "api_key" not in kwargs:
            # Still allow create; adapter will surface a clear error on first call,
            # but warn early when clearly misconfigured.
            logger.warning("OPENAI_API_KEY is not set; openai adapter may fail")
    try:
        return create_adapter(name, **kwargs)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ImportError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Failed to create adapter %s", name)
        raise HTTPException(
            status_code=400,
            detail=f"Failed to create adapter '{name}': {exc}",
        ) from exc


# ---------------------------------------------------------------------------
# Routes (prefixed with /api — Vercel keeps the original path)
# ---------------------------------------------------------------------------


@app.get("/api/health")
def health() -> dict[str, Any]:
    db_ok = True
    db_error = None
    try:
        store = FailureStore(db_path=_default_db_path())
        _ = store.count()
    except Exception as exc:
        db_ok = False
        db_error = str(exc)
        logger.warning("Health check: DB not ready: %s", exc)

    return {
        "status": "ok" if db_ok else "degraded",
        "version": __version__,
        "service": "agent-stress-lab",
        "time": datetime.now(timezone.utc).isoformat(),
        "database": {"ok": db_ok, "error": db_error},
    }


@app.get("/api/adapters")
def adapters() -> dict[str, Any]:
    try:
        return {"adapters": list_adapters()}
    except Exception as exc:
        logger.exception("list_adapters failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


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
    try:
        strategies = get_strategies(categories=categories)
    except Exception as exc:
        logger.exception("get_strategies failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

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
                detail=f"Unknown category: {body.category}. "
                f"Available: {[c.value for c in AttackCategory]}",
            )

    agent = _build_adapter(
        body.adapter, endpoint=body.endpoint, model=body.model
    )

    store = None
    if body.persist:
        try:
            store = get_store()
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("Could not open failure store; continuing without persist")
            store = None

    try:
        tester = RedTeamTester(
            agent,
            max_attacks=body.max_attacks,
            seed=body.seed,
            verbose=False,
            categories=categories,
            persist_failures=bool(store),
            failure_store=store,
        )
        session = tester.run()
        metrics = compute_metrics(session)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Red-team session failed")
        raise HTTPException(
            status_code=500,
            detail=f"Red-team session failed: {exc}",
        ) from exc

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
    try:
        rows = store.list(agent_name=agent, limit=limit)
        total = store.count()
    except Exception as exc:
        logger.exception("Failed to list failures")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list failures: {exc}",
        ) from exc

    return {
        "total": total,
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
    try:
        f = store.get(failure_id)
    except Exception as exc:
        logger.exception("Failed to get failure %s", failure_id)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load failure: {exc}",
        ) from exc

    if not f:
        raise HTTPException(status_code=404, detail=f"Failure '{failure_id}' not found")

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

    try:
        stored = store.get(failure_id)
    except Exception as exc:
        logger.exception("Failed to load failure %s for replay", failure_id)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load failure: {exc}",
        ) from exc

    if not stored:
        raise HTTPException(status_code=404, detail=f"Failure '{failure_id}' not found")

    agent = _build_adapter(
        body.adapter, endpoint=body.endpoint, model=body.model
    )

    try:
        tester = RedTeamTester(
            agent,
            persist_failures=False,
            failure_store=store,
        )
        result = tester.replay_failure(failure_id)
    except Exception as exc:
        logger.exception("Replay failed for %s", failure_id)
        raise HTTPException(
            status_code=500,
            detail=f"Replay failed: {exc}",
        ) from exc

    if result is None:
        raise HTTPException(
            status_code=500,
            detail="Replay failed: no result returned",
        )

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


@app.get("/")
def root() -> dict[str, str]:
    return {
        "service": "agent-stress-lab",
        "docs": "/docs",
        "health": "/api/health",
    }
