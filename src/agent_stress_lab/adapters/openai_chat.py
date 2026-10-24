"""OpenAI Chat Completions adapter (function-calling / tools)."""

from __future__ import annotations

import json
import os
import time
from typing import Any

from agent_stress_lab.core.agent_adapter import (
    AgentAdapter,
    AgentConfig,
    AgentResponse,
    ToolCall,
    ToolCallStatus,
)


class OpenAIChatAdapter(AgentAdapter):
    """
    Real adapter for OpenAI-compatible Chat Completions API.

    Requires: pip install openai
    Env: OPENAI_API_KEY (or pass api_key=)

    The agent under test is defined by the system prompt + tools you configure.
    """

    def __init__(
        self,
        config: AgentConfig,
        *,
        model: str = "gpt-4o-mini",
        api_key: str | None = None,
        base_url: str | None = None,
        temperature: float = 0.2,
        max_tokens: int = 1024,
        tools: list[dict[str, Any]] | None = None,
    ):
        super().__init__(config)
        try:
            from openai import OpenAI
        except ImportError as e:
            raise ImportError(
                "openai package required for OpenAIChatAdapter. "
                "Install with: pip install agent-stress-lab[llm]"
            ) from e

        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.tools = tools or self._default_tools_from_config()
        self.client = OpenAI(
            api_key=api_key or os.getenv("OPENAI_API_KEY"),
            base_url=base_url,
        )
        self._messages: list[dict[str, Any]] = [
            {"role": "system", "content": config.system_prompt}
        ]

    def _default_tools_from_config(self) -> list[dict[str, Any]]:
        """Minimal tool schemas based on the declared tool names."""
        schemas = []
        for name in self.config.tools:
            if name == "web_search":
                schemas.append(
                    {
                        "type": "function",
                        "function": {
                            "name": "web_search",
                            "description": "Search the web for information",
                            "parameters": {
                                "type": "object",
                                "properties": {
                                    "query": {"type": "string", "description": "Search query"}
                                },
                                "required": ["query"],
                            },
                        },
                    }
                )
            elif name == "save_note":
                schemas.append(
                    {
                        "type": "function",
                        "function": {
                            "name": "save_note",
                            "description": "Save a research note",
                            "parameters": {
                                "type": "object",
                                "properties": {
                                    "content": {"type": "string"}
                                },
                                "required": ["content"],
                            },
                        },
                    }
                )
            else:
                schemas.append(
                    {
                        "type": "function",
                        "function": {
                            "name": name,
                            "description": f"Tool: {name}",
                            "parameters": {"type": "object", "properties": {}},
                        },
                    }
                )
        return schemas

    def reset(self) -> None:
        self._messages = [{"role": "system", "content": self.config.system_prompt}]

    def send(self, message: str, *, role: str = "user") -> AgentResponse:
        start = time.perf_counter()
        self._messages.append({"role": role, "content": message})

        kwargs: dict[str, Any] = {
            "model": self.model,
            "messages": self._messages,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
        }
        if self.tools:
            kwargs["tools"] = self.tools
            kwargs["tool_choice"] = "auto"

        try:
            completion = self.client.chat.completions.create(**kwargs)
        except Exception as exc:
            latency = (time.perf_counter() - start) * 1000
            return AgentResponse(
                content=f"[OpenAI adapter error] {exc}",
                latency_ms=latency,
                raw={"error": str(exc)},
            )

        choice = completion.choices[0]
        msg = choice.message
        content = msg.content or ""
        tool_calls: list[ToolCall] = []

        if msg.tool_calls:
            for tc in msg.tool_calls:
                args = {}
                try:
                    args = json.loads(tc.function.arguments or "{}")
                except json.JSONDecodeError:
                    args = {"raw": tc.function.arguments}
                tool_calls.append(
                    ToolCall(
                        name=tc.function.name,
                        arguments=args,
                        status=ToolCallStatus.SUCCESS,
                    )
                )
            # Keep conversation coherent for multi-turn
            self._messages.append(
                {
                    "role": "assistant",
                    "content": content,
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments,
                            },
                        }
                        for tc in msg.tool_calls
                    ],
                }
            )
        else:
            self._messages.append({"role": "assistant", "content": content})

        usage = {}
        if completion.usage:
            usage = {
                "prompt": completion.usage.prompt_tokens,
                "completion": completion.usage.completion_tokens,
                "total": completion.usage.total_tokens,
            }

        latency = (time.perf_counter() - start) * 1000
        return AgentResponse(
            content=content,
            tool_calls=tool_calls,
            raw={"finish_reason": choice.finish_reason, "model": self.model},
            latency_ms=latency,
            token_usage=usage,
        )
