"""Real agent adapters + factory."""

from agent_stress_lab.adapters.base import BaseHTTPAdapter
from agent_stress_lab.adapters.openai_chat import OpenAIChatAdapter
from agent_stress_lab.adapters.registry import create_adapter, list_adapters

__all__ = [
    "BaseHTTPAdapter",
    "OpenAIChatAdapter",
    "create_adapter",
    "list_adapters",
]

try:
    from agent_stress_lab.adapters.anthropic_chat import AnthropicChatAdapter

    __all__.append("AnthropicChatAdapter")
except ImportError:
    pass
