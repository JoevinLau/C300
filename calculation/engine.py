"""USEEIO spend-based emission engine shared by calculation/main.py and the API."""

from __future__ import annotations

from typing import Any

# Reference tables from calculation/main.py (authoritative formula source).
FX_TABLE: dict[int, float] = {
    2023: 0.75,
    2024: 0.74,
    2025: 0.73,
    2026: 0.72,
}

GDP_DEFLATOR: dict[int, float] = {
    2022: 100.0,
    2023: 103.2,
    2024: 106.5,
    2025: 109.0,
    2026: 111.5,
}

USEEIO_FACTORS: dict[str, float] = {
    "metal": 0.85,
    "machining": 0.45,
    "surface": 1.20,
}

GDP_BASE_YEAR = 2022


def convert_sgd_to_usd(amount_sgd: float, year: int) -> float:
    rate = FX_TABLE.get(year)
    if rate is None:
        raise ValueError(f"No FX rate for year {year}")
    return amount_sgd * rate


def convert_to_2022_usd(amount_usd: float, year: int) -> float:
    gdp_year = GDP_DEFLATOR.get(year)
    gdp_2022 = GDP_DEFLATOR[GDP_BASE_YEAR]
    if gdp_year is None:
        raise ValueError(f"No GDP deflator for year {year}")
    return amount_usd * (gdp_2022 / gdp_year)


def compute_component_emission(amount_sgd: float, year: int, factor: float) -> tuple[float, float, float]:
    """Returns (usd, usd_2022, emission_kg) for one spend category."""
    usd = convert_sgd_to_usd(amount_sgd, year)
    usd_2022 = convert_to_2022_usd(usd, year)
    emission = usd_2022 * factor
    return usd, usd_2022, emission


def compute_from_sgd_amounts(
    year: int,
    raw_material_sgd: float,
    fabrication_sgd: float,
    surface_treatment_sgd: float,
) -> dict[str, Any]:
    """
    Canonical invoice calculation — same steps as mode3_manual_input in main.py:
    SGD -> USD (FX_TABLE) -> 2022 USD (GDP_DEFLATOR) -> x USEEIO_FACTORS.
    """
    if year not in FX_TABLE:
        raise ValueError(f"No FX rate for year {year}")
    if year not in GDP_DEFLATOR:
        raise ValueError(f"No GDP deflator for year {year}")

    raw_usd, raw_usd2022, raw_emission = compute_component_emission(
        raw_material_sgd, year, USEEIO_FACTORS["metal"]
    )
    fab_usd, fab_usd2022, fab_emission = compute_component_emission(
        fabrication_sgd, year, USEEIO_FACTORS["machining"]
    )
    surf_usd, surf_usd2022, surf_emission = compute_component_emission(
        surface_treatment_sgd, year, USEEIO_FACTORS["surface"]
    )

    return {
        "calculation": {
            "fx_rate": FX_TABLE[year],
            "inflation_index": GDP_DEFLATOR[year],
            "year": year,
            "sgd_amounts": {
                "raw_material": raw_material_sgd,
                "fabrication": fabrication_sgd,
                "surface_treatment": surface_treatment_sgd,
            },
            "usd_amounts": {
                "raw_material": raw_usd,
                "fabrication": fab_usd,
                "surface_treatment": surf_usd,
            },
            "usd2022_amounts": {
                "raw_material": raw_usd2022,
                "fabrication": fab_usd2022,
                "surface_treatment": surf_usd2022,
            },
            "factors": {
                "raw_material": USEEIO_FACTORS["metal"],
                "fabrication": USEEIO_FACTORS["machining"],
                "surface_treatment": USEEIO_FACTORS["surface"],
            },
        },
        "costs": {
            "raw_material_usd2022": raw_usd2022,
            "fabrication_usd2022": fab_usd2022,
            "surface_treatment_usd2022": surf_usd2022,
        },
        "emissions": {
            "raw_material": raw_emission,
            "fabrication": fab_emission,
            "surface_treatment": surf_emission,
            "total": raw_emission + fab_emission + surf_emission,
        },
    }


def compute_emissions(payload: dict[str, Any]) -> dict[str, Any]:
    year = int(payload["year"])

    if "sgd_amounts" in payload and payload["sgd_amounts"] is not None:
        amounts = payload["sgd_amounts"]
        return compute_from_sgd_amounts(
            year,
            float(amounts["raw_material"]),
            float(amounts["fabrication"]),
            float(amounts["surface_treatment"]),
        )

    # Legacy: derive SGD amounts from allocation percentages of invoice total.
    total_sgd = float(payload["total_amount_sgd"])
    allocation = payload["allocation"]
    return compute_from_sgd_amounts(
        year,
        total_sgd * allocation["raw_material_pct"] / 100.0,
        total_sgd * allocation["fabrication_pct"] / 100.0,
        total_sgd * allocation["surface_treatment_pct"] / 100.0,
    )
