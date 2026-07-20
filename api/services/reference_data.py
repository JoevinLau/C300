from __future__ import annotations

from typing import Tuple

from fastapi import HTTPException
from mysql.connector import Error as MySQLError

from repositories.reference_data import DEFAULT_REFERENCE_DATA, ReferenceDataRepository
from services.common import log_db_error as _log_db_error


def get_fx_and_inflation(
    year: int,
    *,
    repository: ReferenceDataRepository = DEFAULT_REFERENCE_DATA,
) -> Tuple[float, float]:
    """
    Read SGD->USD and inflation/CPI values from the unified schema.
    """
    try:
        fx_row, inflation_row = repository.fx_and_inflation(year)
        if not fx_row:
            raise HTTPException(status_code=400, detail=f"No exchange rate for year {year}")
        if not inflation_row:
            raise HTTPException(status_code=400, detail=f"No inflation index for year {year}")

        return float(fx_row["rate_to_usd"]), float(inflation_row["index_value"])
    except HTTPException:
        raise
    except MySQLError as exc:
        _log_db_error("Failed to query FX/inflation tables", exc, year=year)
        raise HTTPException(
            status_code=503,
            detail="Authoritative FX and inflation reference data is unavailable.",
        ) from exc


def get_kgco2e_per_usd(
    naics_code: str,
    *,
    repository: ReferenceDataRepository = DEFAULT_REFERENCE_DATA,
) -> float:
    """
    Read kgCO2e per USD from official_naics_factors for a given NAICS code.
    """
    code = str(naics_code or "").strip()
    try:
        row = repository.naics_factor(code)
        if not row:
            raise HTTPException(status_code=400, detail=f"No emission factor for NAICS code {code}")
        return float(row["kgco2e_per_usd"])
    except HTTPException:
        raise
    except MySQLError as exc:
        _log_db_error("Failed to load kgCO2e factor", exc, naics_code=code)
        raise HTTPException(
            status_code=503,
            detail="Authoritative NAICS reference data is unavailable.",
        ) from exc
