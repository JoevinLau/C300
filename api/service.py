# services.py
from typing import Tuple
from fastapi import HTTPException

from db import get_conn


def get_fx_and_inflation(year: int) -> Tuple[float, float]:
    """
    Read SGD→USD rate and US inflation rate from Exchange_Inflation_Table
    for a given year.
    """
    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            SELECT sgd_to_usd_rate, us_inflation_rate
            FROM Exchange_Inflation_Table
            WHERE year = %s
            """,
            (year,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(
                status_code=400,
                detail=f"No FX/inflation data for year {year}",
            )
        return float(row["sgd_to_usd_rate"]), float(row["us_inflation_rate"])
    finally:
        conn.close()


def get_kgco2e_per_usd(naics_code: str) -> float:
    """
    Read kgCO2e per USD from USEEIO_Factors_Table for a given NAICS code.
    """
    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            SELECT kgco2e_per_usd
            FROM USEEIO_Factors_Table
            WHERE naics_code = %s
            """,
            (naics_code,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(
                status_code=400,
                detail=f"No USEEIO factor for NAICS code " + naics_code,
            )
        return float(row["kgco2e_per_usd"])
    finally:
        conn.close()