"""Rough token-cost estimates for real LLM adapters."""

from __future__ import annotations

# USD per 1M tokens (approx, mid-2025–2026 public list prices)
PRICE_PER_1M = {
    "gpt-4o-mini": {"prompt": 0.15, "completion": 0.60},
    "gpt-4o": {"prompt": 2.50, "completion": 10.00},
    "gpt-4.1-mini": {"prompt": 0.40, "completion": 1.60},
    "gpt-4.1": {"prompt": 2.00, "completion": 8.00},
    "claude-3-5-haiku-latest": {"prompt": 0.80, "completion": 4.00},
    "claude-3-5-sonnet-latest": {"prompt": 3.00, "completion": 15.00},
    "claude-sonnet-4": {"prompt": 3.00, "completion": 15.00},
    "default": {"prompt": 1.00, "completion": 3.00},
}


def estimate_cost_usd(
    model: str,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
) -> float:
    rates = PRICE_PER_1M.get(model) or PRICE_PER_1M["default"]
    if model not in PRICE_PER_1M:
        for key in PRICE_PER_1M:
            if key in model or model in key:
                rates = PRICE_PER_1M[key]
                break
    cost = (prompt_tokens / 1_000_000) * rates["prompt"]
    cost += (completion_tokens / 1_000_000) * rates["completion"]
    return round(cost, 6)


def session_cost_usd(results: list[dict]) -> float:
    total = 0.0
    for r in results:
        usage = r.get("token_usage") or {}
        model = (r.get("raw") or {}).get("model") or r.get("model") or "default"
        total += estimate_cost_usd(
            model,
            usage.get("prompt", 0),
            usage.get("completion", 0),
        )
    return round(total, 6)
