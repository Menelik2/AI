"""Persistent store for confirmed failures → regression suite."""

from __future__ import annotations

import json
import sqlite3
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_DB_PATH = Path.home() / ".agent_stress_lab" / "failures.db"


@dataclass
class StoredFailure:
    id: str
    agent_name: str
    strategy_id: str
    category: str
    payload: str
    evidence: list[str]
    response_content: str
    tool_calls: list[str]
    notes: str
    created_at: str
    last_replayed_at: str | None = None
    replay_count: int = 0
    still_failing: bool | None = None  # result of last replay
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["evidence"] = self.evidence
        d["tool_calls"] = self.tool_calls
        d["metadata"] = self.metadata
        return d


class FailureStore:
    """
    SQLite-backed persistent failure database.

    Confirmed policy violations are stored so they can be:
    - Listed
    - Replayed later as a regression suite
    - Marked as fixed / still-failing
    """

    def __init__(self, db_path: str | Path | None = None):
        self.db_path = Path(db_path) if db_path else DEFAULT_DB_PATH
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS failures (
                    id TEXT PRIMARY KEY,
                    agent_name TEXT NOT NULL,
                    strategy_id TEXT NOT NULL,
                    category TEXT,
                    payload TEXT NOT NULL,
                    evidence TEXT NOT NULL,
                    response_content TEXT,
                    tool_calls TEXT,
                    notes TEXT,
                    created_at TEXT NOT NULL,
                    last_replayed_at TEXT,
                    replay_count INTEGER DEFAULT 0,
                    still_failing INTEGER,
                    metadata TEXT
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_failures_agent ON failures(agent_name)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_failures_strategy ON failures(strategy_id)"
            )
            conn.commit()

    def add(
        self,
        *,
        agent_name: str,
        strategy_id: str,
        category: str,
        payload: str,
        evidence: list[str],
        response_content: str = "",
        tool_calls: list[str] | None = None,
        notes: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> StoredFailure:
        fid = str(uuid.uuid4())[:12]
        now = datetime.now(timezone.utc).isoformat()
        failure = StoredFailure(
            id=fid,
            agent_name=agent_name,
            strategy_id=strategy_id,
            category=category,
            payload=payload,
            evidence=evidence,
            response_content=response_content,
            tool_calls=tool_calls or [],
            notes=notes,
            created_at=now,
            metadata=metadata or {},
        )
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO failures (
                    id, agent_name, strategy_id, category, payload, evidence,
                    response_content, tool_calls, notes, created_at,
                    last_replayed_at, replay_count, still_failing, metadata
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    failure.id,
                    failure.agent_name,
                    failure.strategy_id,
                    failure.category,
                    failure.payload,
                    json.dumps(failure.evidence),
                    failure.response_content,
                    json.dumps(failure.tool_calls),
                    failure.notes,
                    failure.created_at,
                    None,
                    0,
                    None,
                    json.dumps(failure.metadata),
                ),
            )
            conn.commit()
        return failure

    def list(
        self,
        *,
        agent_name: str | None = None,
        strategy_id: str | None = None,
        still_failing: bool | None = None,
        limit: int = 100,
    ) -> list[StoredFailure]:
        clauses = []
        params: list[Any] = []
        if agent_name:
            clauses.append("agent_name = ?")
            params.append(agent_name)
        if strategy_id:
            clauses.append("strategy_id = ?")
            params.append(strategy_id)
        if still_failing is not None:
            clauses.append("still_failing = ?")
            params.append(1 if still_failing else 0)

        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        sql = f"SELECT * FROM failures {where} ORDER BY created_at DESC LIMIT ?"
        params.append(limit)

        with self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [self._row_to_failure(r) for r in rows]

    def get(self, failure_id: str) -> StoredFailure | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM failures WHERE id = ?", (failure_id,)
            ).fetchone()
        return self._row_to_failure(row) if row else None

    def mark_replay(
        self, failure_id: str, *, still_failing: bool
    ) -> StoredFailure | None:
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE failures
                SET last_replayed_at = ?,
                    replay_count = replay_count + 1,
                    still_failing = ?
                WHERE id = ?
                """,
                (now, 1 if still_failing else 0, failure_id),
            )
            conn.commit()
        return self.get(failure_id)

    def delete(self, failure_id: str) -> bool:
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM failures WHERE id = ?", (failure_id,))
            conn.commit()
            return cur.rowcount > 0

    def count(self) -> int:
        with self._connect() as conn:
            row = conn.execute("SELECT COUNT(*) AS c FROM failures").fetchone()
        return int(row["c"]) if row else 0

    def _row_to_failure(self, row: sqlite3.Row) -> StoredFailure:
        return StoredFailure(
            id=row["id"],
            agent_name=row["agent_name"],
            strategy_id=row["strategy_id"],
            category=row["category"] or "",
            payload=row["payload"],
            evidence=json.loads(row["evidence"] or "[]"),
            response_content=row["response_content"] or "",
            tool_calls=json.loads(row["tool_calls"] or "[]"),
            notes=row["notes"] or "",
            created_at=row["created_at"],
            last_replayed_at=row["last_replayed_at"],
            replay_count=row["replay_count"] or 0,
            still_failing=None
            if row["still_failing"] is None
            else bool(row["still_failing"]),
            metadata=json.loads(row["metadata"] or "{}"),
        )
