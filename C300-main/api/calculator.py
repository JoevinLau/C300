# calculator.py — delegates to calculation/engine.py (authoritative USEEIO formula).
import sys
from pathlib import Path
from typing import Any

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from calculation.engine import compute_emissions as _compute_emissions  # noqa: E402


def compute_emissions(payload: dict[str, Any]) -> dict[str, Any]:
    return _compute_emissions(payload)
