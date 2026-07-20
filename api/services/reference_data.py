from __future__ import annotations

from collections.abc import Callable
from typing import Any, Tuple

from fastapi import HTTPException
from mysql.connector import Error as MySQLError

from db import get_conn
from services.common import log_db_error as _log_db_error


def get_fx_and_inflation(
    year: int,
    *,
    connection_factory: Callable[[], Any] = get_conn,
) -> Tuple[float, float]:
    """
    Read SGD->USD and inflation/CPI values from the unified schema.
    """
    try:
        conn = connection_factory()
    except MySQLError as exc:
        _log_db_error("Database unavailable while loading FX/inflation", exc, year=year)
        raise HTTPException(
            status_code=503,
            detail="Authoritative FX and inflation reference data is unavailable.",
        ) from exc

    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            SELECT rate_to_usd
            FROM exchange_rates
            WHERE year = %s
                AND currency_code = %s
            LIMIT 1
            """,
            (year, "SGD"),
        )
        fx_row = cur.fetchone()
        if not fx_row:
            raise HTTPException(status_code=400, detail=f"No exchange rate for year {year}")

        cur.execute(
            """
            SELECT index_value
            FROM inflation_indices
            WHERE year = %s
            ORDER BY
                CASE WHEN region_code = 'US' THEN 0 ELSE 1 END,
                CASE WHEN index_name = 'CPI' THEN 0 ELSE 1 END
            LIMIT 1
            """,
            (year,),
        )
        inflation_row = cur.fetchone()
        if not inflation_row:
            raise HTTPException(status_code=400, detail=f"No inflation index for year {year}")

        return float(fx_row["rate_to_usd"]), float(inflation_row["index_value"])
    except HTTPException:
        raise
    except MySQLError as exc:
        _log_db_error("Failed to query FX/inflation tables", exc, year=year)
        raise HTTPException(status_code=503, detail=f"Database lookup failed for FX/inflation: {exc}") from exc
    finally:
        if "cur" in locals() and cur:
            cur.close()
        conn.close()


def get_kgco2e_per_usd(
    naics_code: str,
    *,
    connection_factory: Callable[[], Any] = get_conn,
) -> float:
    """
    Read kgCO2e per USD from official_naics_factors for a given NAICS code.
    """
    code = str(naics_code or "").strip()
    try:
        conn = connection_factory()
    except MySQLError as exc:
        _log_db_error("Database unavailable while loading NAICS factor", exc, naics_code=code)
        raise HTTPException(
            status_code=503,
            detail="Authoritative NAICS reference data is unavailable.",
        ) from exc

    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            SELECT kgco2e_per_usd
            FROM official_naics_factors
            WHERE naics_code = %s
            LIMIT 1
            """,
            (code,),
        )
        row = cur.fetchone()
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
    finally:
        if "cur" in locals() and cur:
            cur.close()
        conn.close()
