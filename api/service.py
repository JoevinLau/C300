"""Stable compatibility façade for backend domain services.

Route modules and legacy callers can continue importing from service while the
implementations remain isolated by backend domain.
"""
from __future__ import annotations

from db import get_conn
from services.emissions import (
    calculate_batch_emissions,
    compute_emissions as _compute_emissions,
)
from services.naics import (
    clean_material_name,
    clean_material_token,
    confirm_naics_mapping,
    fetch_naics_for_material,
    get_naics_factor_by_code,
    list_naics_options as _list_naics_options,
    save_material_mapping,
    search_naics_mappings,
    suggest_naics_with_llm,
)
from services.reference_data import (
    get_fx_and_inflation as _get_fx_and_inflation,
    get_kgco2e_per_usd as _get_kgco2e_per_usd,
)
from services.transport import (
    calculate_ecotransit_transport,
    calculate_local_transport_estimate,
)


def get_fx_and_inflation(year: int) -> tuple[float, float]:
    return _get_fx_and_inflation(year, connection_factory=get_conn)


def get_kgco2e_per_usd(naics_code: str) -> float:
    return _get_kgco2e_per_usd(naics_code, connection_factory=get_conn)


def list_naics_options(category: str | None = None) -> list[dict]:
    return _list_naics_options(category, connection_factory=get_conn)


def compute_emissions(payload: dict) -> dict:
    return _compute_emissions(
        payload,
        get_fx_and_inflation=get_fx_and_inflation,
        get_kgco2e_per_usd=get_kgco2e_per_usd,
    )


__all__ = [
    "calculate_batch_emissions",
    "calculate_ecotransit_transport",
    "calculate_local_transport_estimate",
    "clean_material_name",
    "clean_material_token",
    "compute_emissions",
    "confirm_naics_mapping",
    "fetch_naics_for_material",
    "get_fx_and_inflation",
    "get_conn",
    "get_kgco2e_per_usd",
    "get_naics_factor_by_code",
    "list_naics_options",
    "save_material_mapping",
    "search_naics_mappings",
    "suggest_naics_with_llm",
]
