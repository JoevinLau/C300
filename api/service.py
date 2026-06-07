# services.py
from typing import Tuple

import mysql.connector
from fastapi import HTTPException
from mysql.connector import Error as MySQLError

from db import get_conn
from dev_data import DEV_FX_INFLATION, DEV_NAICS_CATALOG, DEV_NAICS_FACTORS


def _dev_fx(year: int) -> Tuple[float, float]:
    values = DEV_FX_INFLATION.get(year)
    if not values:
        raise HTTPException(
            status_code=503,
            detail=f"Database unavailable and no dev FX/inflation data for year {year}",
        )
    return values


def _dev_factor(naics_code: str) -> float:
    factor = DEV_NAICS_FACTORS.get(naics_code)
    if factor is None:
        raise HTTPException(
            status_code=503,
            detail=f"Database unavailable and no dev factor for NAICS {naics_code}",
        )
    return factor


def get_fx_and_inflation(year: int) -> Tuple[float, float]:
    """
    Read SGD→USD rate and US inflation rate from Exchange_Inflation_Table
    for a given year. Falls back to dev_data when MySQL is unreachable.
    """
    try:
        conn = get_conn()
    except MySQLError:
        return _dev_fx(year)

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
    except MySQLError:
        return _dev_fx(year)
    finally:
        conn.close()


def _dev_naics_catalog() -> list[dict[str, object]]:
    return DEV_NAICS_CATALOG

#addline
# NAICS code descriptions
NAICS_DESCRIPTIONS: dict[str, str] = {
    "331110": "Iron and Steel Mills and Ferroalloy Manufacturing",
    "331315": "Aluminum Sheet, Plate, and Foil Manufacturing",
    "331420": "Copper Rolling, Drawing, Extruding and Alloying",
    "331491": "Nonferrous Metal (except Aluminum) Rolling, Drawing, Extruding",
    "335991": "Other Electrical Equipment Manufacturing",
    "332999": "All Other Miscellaneous Fabricated Metal Product Manufacturing",
    "326199": "All Other Plastics Product Manufacturing",
    "325220": "Artificial and Synthetic Fibers' Manufacturing",
    "326113": "Unlaminated Plastics Film and Sheet Manufacturing",
    "326130": "Plastics Pipe, Pipe Fitting, and Unlaminated Profile Shape Manufacturing",
    "326119": "Unlaminated Plastics Bag Manufacturing",
}


def list_naics_options() -> list[dict[str, object]]:
    """
    List available NAICS codes with descriptions from database.
    Falls back to dev_data when MySQL is unreachable.
    """
    try:
        conn = get_conn()
    except MySQLError:
        return _dev_naics_catalog()

    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            SELECT naics_code, kgco2e_per_usd
            FROM USEEIO_Factors_Table
            ORDER BY naics_code
            """
        )
        rows = cur.fetchall()
        if not rows:
            return _dev_naics_catalog()

        options: list[dict[str, object]] = []
        for row in rows:
            code = str(row.get("naics_code", "")).strip()
            if not code:
                continue
            description = NAICS_DESCRIPTIONS.get(code, f"NAICS {code}")
            option: dict[str, object] = {"code": code, "description": description}
            if row.get("kgco2e_per_usd") is not None:
                option["kgco2e_per_usd"] = float(row["kgco2e_per_usd"])
            options.append(option)

        return options if options else _dev_naics_catalog()
    except MySQLError:
        return _dev_naics_catalog()
    finally:
        conn.close()


def get_kgco2e_per_usd(naics_code: str) -> float:
    """
    Read kgCO2e per USD from USEEIO_Factors_Table for a given NAICS code.
    Falls back to dev_data when MySQL is unreachable.
    """
    try:
        conn = get_conn()
    except MySQLError:
        return _dev_factor(naics_code)

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
    except MySQLError:
        return _dev_factor(naics_code)
    finally:
        conn.close()
