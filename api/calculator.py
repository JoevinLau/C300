# calculator.py — stable entry point for the factor-aware USEEIO calculation service.
from typing import Any

from service import compute_emissions as _compute_emissions


def compute_emissions(payload: dict[str, Any]) -> dict[str, Any]:
    return _compute_emissions(payload)
