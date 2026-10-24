"""Abstract agent adapter and supporting data models."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class ToolCallStatus(str, Enum):
    SUCCESS = "success"
    ERROR = "error"
    BLOCKED = "blocked"


@dataclass
class ToolCall:
    name: str
    arguments: dict[str, Any]
    result: Any = None
    status: ToolCallStatus = ToolCallStatus.SUCCESS
    error: str | None = None


@dataclass
class AgentResponse:
    """Normalized response from any target agent."""

    content: str
    tool_calls: list[ToolCall] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)
    latency_ms: float = 0.0
    token_usage: dict[str, int] = field(default_factory=dict)


@dataclass
class AgentConfig:
    """High-level description of the agent under test."""

    name: str
    system_prompt: str
    tools: list[str]
    policy_rules: list[str]
    secrets: list[str] = field(default_factory=list)  # for deterministic leak detection
    metadata: dict[str, Any] = field(default_factory=dict)


class AgentAdapter(ABC):
    """
    Interface that every target agent must implement.

    For the MVP we only ship a MockResearchAgent.
    Real adapters (OpenAI Assistants, LangGraph, HTTP, etc.) can be added later.
    """

    def __init__(self, config: AgentConfig):
        self.config = config

    @abstractmethod
    def reset(self) -> None:
        """Reset conversation / state between independent tests."""

    @abstractmethod
    def send(self, message: str, *, role: str = "user") -> AgentResponse:
        """Send a message and return a normalized response."""

    def get_policy_rules(self) -> list[str]:
        return list(self.config.policy_rules)

    def get_secrets(self) -> list[str]:
        return list(self.config.secrets)

    def get_available_tools(self) -> list[str]:
        return list(self.config.tools)
