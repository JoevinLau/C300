#service.py
from typing import Tuple, Optional

import mysql.connector
from fastapi import HTTPException
from db import get_conn


def get_fx_and_inflation(year: int) -> Tuple[float, float]:
    """
    Read SGD->USD rate and US inflation index from database for a given year.
    Returns (fx_rate, inflation_index)
    """
    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        
        # Get exchange rate (SGD to USD)
        cur.execute(
            """SELECT rate_to_usd FROM exchange_rates WHERE year = %s AND currency_code = %s""",
            (year, 'SGD'),
        )
        fx_row = cur.fetchone()
        if not fx_row:
            raise HTTPException(status_code=400, detail=f"No exchange rate for year {year}")
        
        # Get inflation index
        cur.execute(
            """SELECT index_value FROM inflation_indices WHERE year = %s""",
            (year,),
        )
        inflation_row = cur.fetchone()
        if not inflation_row:
            raise HTTPException(status_code=400, detail=f"No inflation index for year {year}")
        
        return float(fx_row["rate_to_usd"]), float(inflation_row["index_value"])
    finally:
        conn.close()


def list_naics_options(category: Optional[str] = None) -> list[dict]:
    """
    List available NAICS codes with descriptions from database.
    Optionally filter by category (raw_material, fabrication, surface_treatment).
    """
    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        
        if category:
            cur.execute(
                """
                SELECT naics_code, naics_description, category, kgco2e_per_usd
                FROM naics_factors
                WHERE category = %s
                ORDER BY naics_code
                """,
                (category,),
            )
        else:
            cur.execute(
                """
                SELECT naics_code, naics_description, category, kgco2e_per_usd
                FROM naics_factors
                ORDER BY category, naics_code
                """
            )
        
        rows = cur.fetchall()
        if not rows:
            return []

        options: list[dict] = []
        for row in rows:
            code = str(row.get("naics_code", "")).strip()
            if not code:
                continue
            
            option: dict = {
                "code": code,
                "description": row.get("naics_description", f"NAICS {code}"),
                "category": row.get("category", ""),
            }
            if row.get("kgco2e_per_usd") is not None:
                option["kgco2e_per_usd"] = float(row["kgco2e_per_usd"])
            options.append(option)

        return options
    finally:
        conn.close()


def get_kgco2e_per_usd(naics_code: str) -> float:
    """
    Read kgCO2e per USD from naics_factors for a given NAICS code.
    """
    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            SELECT kgco2e_per_usd
            FROM naics_factors
            WHERE naics_code = %s
            """,
            (naics_code,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(
                status_code=400,
                detail=f"No emission factor for NAICS code " + naics_code,
            )
        return float(row["kgco2e_per_usd"])
    finally:
        conn.close()
