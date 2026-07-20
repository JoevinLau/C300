from __future__ import annotations

from collections.abc import Callable

from fastapi import HTTPException
from mysql.connector import Error as MySQLError

from db import get_conn
from services.common import log_db_error as _log_db_error


def _calculate_batch_emissions_with_factors(
    rows: list[dict],
    factors: dict[str, dict],
    naics_codes: list[str],
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
        results.append({
            **row,
            "mapped_naics": code,
            "naics_description": factor["description"],
            "kgco2e_per_usd": kgco2e_per_usd,
            "data_source": factor["data_source"],
            "total_kgco2e": amount * kgco2e_per_usd,
        })

    return results


def calculate_batch_emissions(rows: list[dict]) -> list[dict]:
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
        conn = get_conn()
    except MySQLError as exc:
        _log_db_error("Database unavailable during batch calculation", exc, naics_codes=naics_codes)
        raise HTTPException(
            status_code=503,
            detail="Authoritative NAICS reference data is unavailable.",
        ) from exc

    try:
        cur = conn.cursor(dictionary=True)
        placeholders = ", ".join(["%s"] * len(naics_codes))
        cur.execute(
            f"""
            SELECT naics_code, description, category, kgco2e_per_usd, data_source
            FROM official_naics_factors
            WHERE naics_code IN ({placeholders})
            """,
            tuple(naics_codes),
        )
        factors = {
            str(row["naics_code"]): {
                "description": row.get("description"),
                "kgco2e_per_usd": float(row["kgco2e_per_usd"]),
                "data_source": row.get("data_source"),
            }
            for row in cur.fetchall() or []
        }

        return _calculate_batch_emissions_with_factors(rows, factors, naics_codes)
    except HTTPException:
        raise
    except MySQLError as exc:
        _log_db_error("Batch calculation database failure", exc, naics_codes=naics_codes)
        raise HTTPException(
            status_code=503,
            detail="Authoritative NAICS reference data is unavailable.",
        ) from exc
    finally:
        if "cur" in locals() and cur:
            cur.close()
        conn.close()


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

    inflation_ratio = index_2022 / inflation_index

    results = {}
    total_emission = 0.0
    line_item_results: list[dict] = []

    for key in ("raw_material", "fabrication", "surface_treatment"):
        results[key] = {
            "sgd": 0.0,
            "usd": 0.0,
            "usd2022": 0.0,
            "emission": 0.0,
        }

    if line_items:
        for item in line_items:
            category = str(item.get("category", "")).strip()
            if category not in results:
                raise HTTPException(status_code=400, detail=f"Invalid line item category: {category}")

            amt_sgd = float(item.get("amount_sgd", 0))
            if amt_sgd <= 0:
                continue

            naics_code = str(item.get("naics_code", "")).strip()
            factor = get_kgco2e_per_usd(naics_code)
            amt_usd = amt_sgd * fx_rate
            amt_usd2022 = amt_usd * inflation_ratio
            emission = amt_usd2022 * factor

            results[category]["sgd"] += amt_sgd
            results[category]["usd"] += amt_usd
            results[category]["usd2022"] += amt_usd2022
            results[category]["emission"] += emission
            total_emission += emission

            line_item_results.append({
                "category": category,
                "amount_sgd": amt_sgd,
                "amount_usd": amt_usd,
                "amount_usd2022": amt_usd2022,
                "naics_code": naics_code,
                "factor": factor,
                "emission": emission,
            })
    else:
        for key in ("raw_material", "fabrication", "surface_treatment"):
            amt_sgd = float(sgd_amounts.get(key, 0))
            factor = get_kgco2e_per_usd(naics[key])
            amt_usd = amt_sgd * fx_rate
            amt_usd2022 = amt_usd * inflation_ratio
            emission = amt_usd2022 * factor

            results[key] = {
                "sgd": amt_sgd,
                "usd": amt_usd,
                "usd2022": amt_usd2022,
                "emission": emission,
            }
            total_emission += emission

    for key, value in results.items():
        value["factor"] = value["emission"] / value["usd2022"] if value["usd2022"] > 0 else 0.0

    calculation = {
        "fx_rate": fx_rate,
        "inflation_index": inflation_index,
        "year": year,
        "sgd_amounts": {k: v["sgd"] for k, v in results.items()},
        "usd_amounts": {k: v["usd"] for k, v in results.items()},
        "usd2022_amounts": {k: v["usd2022"] for k, v in results.items()},
        "factors": {k: v["factor"] for k, v in results.items()},
    }
    if line_item_results:
        calculation["line_items"] = line_item_results

    return {
        "calculation": calculation,
        "costs": {
            "raw_material_usd2022": results["raw_material"]["usd2022"],
            "fabrication_usd2022": results["fabrication"]["usd2022"],
            "surface_treatment_usd2022": results["surface_treatment"]["usd2022"],
        },
        "emissions": {
            "raw_material": results["raw_material"]["emission"],
            "fabrication": results["fabrication"]["emission"],
            "surface_treatment": results["surface_treatment"]["emission"],
            "total": total_emission,
        },
    }
