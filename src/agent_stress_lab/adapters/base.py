"""Generic HTTP / webhook adapter for any agent that speaks a simple JSON API."""

from __future__ import annotations

import time
from typing import Any

import httpx

from agent_stress_lab.core.agent_adapter import (
    AgentAdapter,
    AgentConfig,
    AgentResponse,
    ToolCall,
    ToolCallStatus,
)


class BaseHTTPAdapter(AgentAdapter):
    """
    Talks to an agent via a simple HTTP endpoint.

    Expected request:
        POST {endpoint}
        {
          "message": "...",
          "session_id": "...",   # optional
          "role": "user"
        }

    Expected response (flexible):
        {
          "content": "...",
          "tool_calls": [{"name": "...", "arguments": {...}, "result": ...}],
          "usage": {"prompt": N, "completion": M}
        }
    """

    def __init__(
        self,
        config: AgentConfig,
        *,
        endpoint: str,
        headers: dict[str, str] | None = None,
        timeout: float = 60.0,
        session_id: str | None = None,
    ):
        super().__init__(config)
        self.endpoint = endpoint.rstrip("/")
        self.headers = headers or {"Content-Type": "application/json"}
        self.timeout = timeout
        self.session_id = session_id or f"stress-{int(time.time())}"
        self._client = httpx.Client(timeout=timeout, headers=self.headers)

    def reset(self) -> None:
        # New session id forces a fresh conversation on the remote side
        self.session_id = f"stress-{int(time.time() * 1000)}"

    def send(self, message: str, *, role: str = "user") -> AgentResponse:
        start = time.perf_counter()
        payload = {
            "message": message,
            "role": role,
            "session_id": self.session_id,
        }
        try:
            resp = self._client.post(self.endpoint, json=payload)
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            latency = (time.perf_counter() - start) * 1000
            return AgentResponse(
                content=f"[HTTP adapter error] {exc}",
                latency_ms=latency,
                raw={"error": str(exc)},
            )

        latency = (time.perf_counter() - start) * 1000
        tool_calls = []
        for tc in data.get("tool_calls") or []:
            tool_calls.append(
                ToolCall(
                    name=tc.get("name", "unknown"),
                    arguments=tc.get("arguments") or {},
                    result=tc.get("result"),
                    status=ToolCallStatus(tc.get("status", "success")),
                    error=tc.get("error"),
                )
            )

        return AgentResponse(
            content=data.get("content") or data.get("message") or "",
            tool_calls=tool_calls,
            raw=data,
            latency_ms=latency,
            token_usage=data.get("usage") or {},
        )

    def close(self) -> None:
        self._client.close()
