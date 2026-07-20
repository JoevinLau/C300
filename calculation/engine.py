"""Pure emission formulas shared by backend services and legacy tools."""

from __future__ import annotations

from typing import Any

CATEGORIES = ("raw_material", "fabrication", "surface_treatment")

# Legacy standalone inputs retained only for calculation/main.py. The desktop API
# supplies authoritative values from its reference-data repository.
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


def calculate_spend_component(
    amount_sgd: float,
    fx_rate: float,
    inflation_ratio: float,
    factor: float,
) -> tuple[float, float, float]:
    """Return USD, base-year USD, and emissions for one spend amount."""
    amount_usd = amount_sgd * fx_rate
    amount_usd_base_year = amount_usd * inflation_ratio
    emission = calculate_factor_emission(amount_usd_base_year, factor)
    return amount_usd, amount_usd_base_year, emission


def calculate_factor_emission(activity: float, factor: float) -> float:
    return activity * factor


def calculate_transport_emission(
    weight_kg: float,
    distance_km: float,
    factor_kgco2e_per_tonne_km: float,
) -> float:
    tonne_km = (weight_kg / 1000.0) * distance_km
    return calculate_factor_emission(tonne_km, factor_kgco2e_per_tonne_km)


def calculate_machine_emission(
    average_kw: float,
    operating_hours: float,
    grid_factor_kgco2e_per_kwh: float,
) -> float:
    electricity_kwh = average_kw * operating_hours
    return calculate_factor_emission(electricity_kwh, grid_factor_kgco2e_per_kwh)


def calculate_spend_emissions(
    *,
    year: int,
    amounts_sgd: dict[str, float],
    factors: dict[str, float],
    fx_rate: float,
    inflation_index: float,
    base_inflation_index: float,
    line_items: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Canonical Method 1 spend calculation for category or line-item inputs."""
    inflation_ratio = base_inflation_index / inflation_index
    results = {
        category: {"sgd": 0.0, "usd": 0.0, "usd2022": 0.0, "emission": 0.0}
        for category in CATEGORIES
    }
    line_item_results: list[dict[str, Any]] = []

    if line_items:
        for item in line_items:
            category = str(item.get("category", "")).strip()
            if category not in results:
                raise ValueError(f"Invalid line item category: {category}")

            amount_sgd = float(item.get("amount_sgd", 0))
            if amount_sgd <= 0:
                continue
            factor = float(item["factor"])
            amount_usd, amount_usd2022, emission = calculate_spend_component(
                amount_sgd,
                fx_rate,
                inflation_ratio,
                factor,
            )
            results[category]["sgd"] += amount_sgd
            results[category]["usd"] += amount_usd
            results[category]["usd2022"] += amount_usd2022
            results[category]["emission"] += emission
            line_item_results.append({
                "category": category,
                "amount_sgd": amount_sgd,
                "amount_usd": amount_usd,
                "amount_usd2022": amount_usd2022,
                "naics_code": str(item.get("naics_code", "")).strip(),
                "factor": factor,
                "emission": emission,
            })
    else:
        for category in CATEGORIES:
            amount_sgd = float(amounts_sgd.get(category, 0))
            factor = float(factors[category])
            amount_usd, amount_usd2022, emission = calculate_spend_component(
                amount_sgd,
                fx_rate,
                inflation_ratio,
                factor,
            )
            results[category] = {
                "sgd": amount_sgd,
                "usd": amount_usd,
                "usd2022": amount_usd2022,
                "emission": emission,
            }

    category_factors = {
        category: (
            result["emission"] / result["usd2022"]
            if result["usd2022"] > 0
            else 0.0
        )
        for category, result in results.items()
    }
    calculation: dict[str, Any] = {
        "fx_rate": fx_rate,
        "inflation_index": inflation_index,
        "year": year,
        "sgd_amounts": {category: result["sgd"] for category, result in results.items()},
        "usd_amounts": {category: result["usd"] for category, result in results.items()},
        "usd2022_amounts": {category: result["usd2022"] for category, result in results.items()},
        "factors": category_factors,
    }
    if line_item_results:
        calculation["line_items"] = line_item_results

    emissions = {category: result["emission"] for category, result in results.items()}
    emissions["total"] = sum(emissions.values())
    return {
        "calculation": calculation,
        "costs": {
            "raw_material_usd2022": results["raw_material"]["usd2022"],
            "fabrication_usd2022": results["fabrication"]["usd2022"],
            "surface_treatment_usd2022": results["surface_treatment"]["usd2022"],
        },
        "emissions": emissions,
    }


def convert_sgd_to_usd(amount_sgd: float, year: int) -> float:
    rate = FX_TABLE.get(year)
    if rate is None:
        raise ValueError(f"No FX rate for year {year}")
    return amount_sgd * rate


def convert_to_2022_usd(amount_usd: float, year: int) -> float:
    gdp_year = GDP_DEFLATOR.get(year)
    if gdp_year is None:
        raise ValueError(f"No GDP deflator for year {year}")
    return amount_usd * (GDP_DEFLATOR[GDP_BASE_YEAR] / gdp_year)


def compute_component_emission(
    amount_sgd: float,
    year: int,
    factor: float,
) -> tuple[float, float, float]:
    if year not in FX_TABLE:
        raise ValueError(f"No FX rate for year {year}")
    if year not in GDP_DEFLATOR:
        raise ValueError(f"No GDP deflator for year {year}")
    return calculate_spend_component(
        amount_sgd,
        FX_TABLE[year],
        GDP_DEFLATOR[GDP_BASE_YEAR] / GDP_DEFLATOR[year],
        factor,
    )


def compute_from_sgd_amounts(
    year: int,
    raw_material_sgd: float,
    fabrication_sgd: float,
    surface_treatment_sgd: float,
) -> dict[str, Any]:
    if year not in FX_TABLE:
        raise ValueError(f"No FX rate for year {year}")
    if year not in GDP_DEFLATOR:
        raise ValueError(f"No GDP deflator for year {year}")
    return calculate_spend_emissions(
        year=year,
        amounts_sgd={
            "raw_material": raw_material_sgd,
            "fabrication": fabrication_sgd,
            "surface_treatment": surface_treatment_sgd,
        },
        factors={
            "raw_material": USEEIO_FACTORS["metal"],
            "fabrication": USEEIO_FACTORS["machining"],
            "surface_treatment": USEEIO_FACTORS["surface"],
        },
        fx_rate=FX_TABLE[year],
        inflation_index=GDP_DEFLATOR[year],
        base_inflation_index=GDP_DEFLATOR[GDP_BASE_YEAR],
    )


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

    total_sgd = float(payload["total_amount_sgd"])
    allocation = payload["allocation"]
    return compute_from_sgd_amounts(
        year,
        total_sgd * allocation["raw_material_pct"] / 100.0,
        total_sgd * allocation["fabrication_pct"] / 100.0,
        total_sgd * allocation["surface_treatment_pct"] / 100.0,
    )
