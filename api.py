"""Vercel / local ASGI entrypoint for the Agent Stress Lab API."""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure src/ layout is importable when the package is not installed editable
_src = Path(__file__).resolve().parent / "src"
if _src.is_dir() and str(_src) not in sys.path:
    sys.path.insert(0, str(_src))

from agent_stress_lab.api import app

__all__ = ["app"]
