"""Generic HTTP / webhook adapter for any agent that speaks a simple JSON API."""

from __future__ import annotations

import logging
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

logger = logging.getLogger(__name__)


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
        if not endpoint or not str(endpoint).strip():
            raise ValueError("HTTP adapter requires a non-empty endpoint URL")
        self.endpoint = str(endpoint).rstrip("/")
        self.headers = headers or {"Content-Type": "application/json"}
        self.timeout = timeout
        self.session_id = session_id or f"stress-{int(time.time())}"
        self._client = httpx.Client(timeout=timeout, headers=self.headers)

    def reset(self) -> None:
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
        except httpx.TimeoutException as exc:
            latency = (time.perf_counter() - start) * 1000
            logger.warning("HTTP adapter timeout: %s", exc)
            return AgentResponse(
                content=f"[HTTP adapter error] Request timed out after {self.timeout}s",
                latency_ms=latency,
                raw={"error": "timeout", "detail": str(exc)},
            )
        except httpx.HTTPStatusError as exc:
            latency = (time.perf_counter() - start) * 1000
            status = exc.response.status_code if exc.response is not None else "?"
            body = ""
            try:
                body = (exc.response.text or "")[:300]
            except Exception:
                pass
            logger.warning("HTTP adapter status %s: %s", status, body)
            return AgentResponse(
                content=f"[HTTP adapter error] HTTP {status}: {body or exc}",
                latency_ms=latency,
                raw={"error": "http_status", "status": status, "body": body},
            )
        except httpx.RequestError as exc:
            latency = (time.perf_counter() - start) * 1000
            logger.warning("HTTP adapter request error: %s", exc)
            return AgentResponse(
                content=f"[HTTP adapter error] Network error: {exc}",
                latency_ms=latency,
                raw={"error": "network", "detail": str(exc)},
            )
        except Exception as exc:
            latency = (time.perf_counter() - start) * 1000
            logger.exception("HTTP adapter unexpected error")
            return AgentResponse(
                content=f"[HTTP adapter error] {exc}",
                latency_ms=latency,
                raw={"error": "unknown", "detail": str(exc)},
            )

        try:
            data = resp.json()
        except ValueError as exc:
            latency = (time.perf_counter() - start) * 1000
            snippet = (resp.text or "")[:200]
            return AgentResponse(
                content=f"[HTTP adapter error] Invalid JSON response: {exc}",
                latency_ms=latency,
                raw={"error": "invalid_json", "body": snippet},
            )

        if not isinstance(data, dict):
            data = {"content": str(data)}

        latency = (time.perf_counter() - start) * 1000
        tool_calls: list[ToolCall] = []
        for tc in data.get("tool_calls") or []:
            if not isinstance(tc, dict):
                continue
            status_raw = tc.get("status", "success")
            try:
                status = ToolCallStatus(status_raw)
            except ValueError:
                status = ToolCallStatus.SUCCESS
            tool_calls.append(
                ToolCall(
                    name=tc.get("name", "unknown"),
                    arguments=tc.get("arguments") or {},
                    result=tc.get("result"),
                    status=status,
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
        try:
            self._client.close()
        except Exception as exc:
            logger.debug("HTTP client close error: %s", exc)
