from __future__ import annotations

from collections.abc import Callable

from fastapi import HTTPException
from mysql.connector import Error as MySQLError

from calculation.engine import calculate_spend_component, calculate_spend_emissions
from dev_data import MAX_CALCULATION_YEAR
from repositories.reference_data import DEFAULT_REFERENCE_DATA, ReferenceDataRepository
from services.common import log_db_error as _log_db_error


def _calculate_batch_emissions_with_factors(
    rows: list[dict],
    factors: dict[str, dict],
    naics_codes: list[str],
    references_by_year: dict[int, tuple[float, float, float]],
) -> list[dict]:
    missing = [code for code in naics_codes if code not in factors]
    if missing:
        raise HTTPException(status_code=400, detail=f"Invalid NAICS Code: {', '.join(missing)}")

    results: list[dict] = []
    for index, row in enumerate(rows):
        code = str(row.get("mapped_naics") or row.get("naics_code") or "").strip()
        if not code:
            raise HTTPException(status_code=400, detail=f"Row {index + 1} is missing mapped_naics.")

        try:
            amount = float(row.get("total_amount_sgd") or 0)
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Row {index + 1} has an invalid total_amount_sgd.",
            ) from exc

        factor = factors[code]
        kgco2e_per_usd = float(factor["kgco2e_per_usd"])
        year = int(row.get("year") or MAX_CALCULATION_YEAR)
        fx_rate, inflation_index, base_inflation_index = references_by_year[year]
        _, _, total_kgco2e = calculate_spend_component(
            amount,
            fx_rate,
            base_inflation_index / inflation_index,
            kgco2e_per_usd,
        )
        results.append({
            **row,
            "mapped_naics": code,
            "naics_description": factor["description"],
            "kgco2e_per_usd": kgco2e_per_usd,
            "data_source": factor["data_source"],
            "total_kgco2e": total_kgco2e,
        })

    return results


def calculate_batch_emissions(
    rows: list[dict],
    *,
    repository: ReferenceDataRepository = DEFAULT_REFERENCE_DATA,
) -> list[dict]:
    if not rows:
        return []

    naics_codes = sorted({
        str(row.get("mapped_naics") or row.get("naics_code") or "").strip()
        for row in rows
        if str(row.get("mapped_naics") or row.get("naics_code") or "").strip()
    })
    if not naics_codes:
        raise HTTPException(status_code=400, detail="At least one mapped_naics value is required.")

    try:
        factor_rows = repository.naics_factors(naics_codes)
        factors = {
            str(row["naics_code"]): {
                "description": row.get("description"),
                "kgco2e_per_usd": float(row["kgco2e_per_usd"]),
                "data_source": row.get("data_source"),
            }
            for row in factor_rows
        }
        years = sorted({int(row.get("year") or MAX_CALCULATION_YEAR) for row in rows})
        _, base_inflation = repository.fx_and_inflation(2022)
        if not base_inflation:
            raise HTTPException(status_code=400, detail="No inflation index for year 2022")
        references_by_year: dict[int, tuple[float, float, float]] = {}
        for year in years:
            fx_row, inflation_row = repository.fx_and_inflation(year)
            if not fx_row:
                raise HTTPException(status_code=400, detail=f"No exchange rate for year {year}")
            if not inflation_row:
                raise HTTPException(status_code=400, detail=f"No inflation index for year {year}")
            references_by_year[year] = (
                float(fx_row["rate_to_usd"]),
                float(inflation_row["index_value"]),
                float(base_inflation["index_value"]),
            )

        return _calculate_batch_emissions_with_factors(
            rows,
            factors,
            naics_codes,
            references_by_year,
        )
    except HTTPException:
        raise
    except MySQLError as exc:
        _log_db_error("Batch calculation database failure", exc, naics_codes=naics_codes)
        raise HTTPException(
            status_code=503,
            detail="Authoritative NAICS reference data is unavailable.",
        ) from exc


def compute_emissions(
    payload: dict,
    *,
    get_fx_and_inflation: Callable[[int], tuple[float, float]],
    get_kgco2e_per_usd: Callable[[str], float],
) -> dict:
    """
    Calculate emissions using exchange rates, inflation indices, and official NAICS factors.
    """
    year = int(payload["year"])
    naics = payload["naics"]
    sgd_amounts = payload["sgd_amounts"]
    line_items = payload.get("line_items") or []

    fx_rate, inflation_index = get_fx_and_inflation(year)
    _, index_2022 = get_fx_and_inflation(2022)

    canonical_line_items = [
        {
            **item,
            "factor": get_kgco2e_per_usd(str(item.get("naics_code", "")).strip()),
        }
        for item in line_items
    ]
    factors = {
        category: get_kgco2e_per_usd(naics[category])
        for category in ("raw_material", "fabrication", "surface_treatment")
    } if not line_items else {}

    try:
        return calculate_spend_emissions(
            year=year,
            amounts_sgd={
                category: float(sgd_amounts.get(category, 0))
                for category in ("raw_material", "fabrication", "surface_treatment")
            },
            factors=factors,
            fx_rate=fx_rate,
            inflation_index=inflation_index,
            base_inflation_index=index_2022,
            line_items=canonical_line_items,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
