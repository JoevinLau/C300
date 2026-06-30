# service.py
from __future__ import annotations

from datetime import datetime
import json
import logging
import os
import re
from typing import Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import HTTPException
from mysql.connector import Error as MySQLError

from db import get_conn
from dev_data import DEV_FX_INFLATION

logger = logging.getLogger(__name__)

DEFAULT_USER_ID = os.getenv("DEFAULT_USER_ID", "default")
OPENAI_MODEL = os.getenv("OPENAI_NAICS_MODEL", "gpt-4o-mini")


def _log_db_error(message: str, exc: BaseException, **context: object) -> None:
    logger.exception("%s context=%s error=%s", message, context, exc)
    print(f"{message}: {exc} context={context}", flush=True)


def get_fx_and_inflation(year: int) -> Tuple[float, float]:
    """
    Read SGD->USD and inflation/CPI values from the unified schema.
    Falls back to local dev data only when the database is unavailable.
    """
    try:
        conn = get_conn()
    except MySQLError as exc:
        _log_db_error("Database unavailable while loading FX/inflation", exc, year=year)
        values = DEV_FX_INFLATION.get(year)
        if values:
            return values
        raise HTTPException(status_code=400, detail=f"No exchange rate for year {year}") from exc

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


def clean_material_token(raw_name: str) -> str:
    if not raw_name:
        return ""

    text = str(raw_name).upper().strip()
    text = re.sub(r"\([^)]*\)", " ", text)
    text = re.sub(r"(\d+(\.\d+)?\s*[X\*]\s*\d+).*", "", text)
    text = re.sub(r"\b\d+(\.\d+)?\s*(MM|CM|M|INCH|L|KG|G)\b.*", "", text)
    noise_words = r"\b(PLATE|SHEET|BAR|ROD|SCRAP|ROLL|TUBE|PIPE|BLOCK|STRIP|COIL|BOXES|WIRE)\b"
    text = re.sub(noise_words, "", text)
    text = re.sub(r"[^A-Z0-9\-]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def clean_material_name(name: str) -> str:
    return clean_material_token(name)


def _normalize_material_token(material: str) -> str:
    return clean_material_token(material)


def _official_factor_to_option(row: dict, source: str, confidence: str) -> dict:
    return {
        "code": str(row.get("naics_code", "") or "").strip(),
        "description": str(row.get("description", "") or "").strip(),
        "kgco2e_per_usd": float(row["kgco2e_per_usd"]) if row.get("kgco2e_per_usd") is not None else None,
        "category": row.get("category"),
        "data_source": row.get("data_source"),
        "source": source,
        "confidence": confidence,
    }


def search_naics_mappings(keyword: str, user_id: str = DEFAULT_USER_ID) -> dict:
    token = _normalize_material_token(keyword)
    if not token:
        raise HTTPException(status_code=400, detail="Search keyword is required.")

    try:
        conn = get_conn()
        cur = conn.cursor(dictionary=True)

        # Tier 1: user's confirmed material dictionary.
        cur.execute(
            """
            SELECT mapped_naics
            FROM user_custom_dictionary
            WHERE material_token = %s
                AND user_id = %s
            LIMIT 1
            """,
            (token, user_id),
        )
        dictionary_hit = cur.fetchone()
        if dictionary_hit:
            cur.execute(
                """
                SELECT naics_code, description, category, kgco2e_per_usd, data_source
                FROM official_naics_factors
                WHERE naics_code = %s
                LIMIT 1
                """,
                (dictionary_hit["mapped_naics"],),
            )
            official_hit = cur.fetchone()
            if not official_hit:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "Custom dictionary points to a missing official NAICS factor: "
                        f"{dictionary_hit['mapped_naics']}"
                    ),
                )

            return {
                "query": keyword,
                "material_token": token,
                "tier": 1,
                "matches": [_official_factor_to_option(official_hit, "user_custom_dictionary", "exact")],
            }

        # Fast exact lookup for direct NAICS-code inputs or exact descriptions.
        cur.execute(
            """
            SELECT naics_code, description, category, kgco2e_per_usd, data_source
            FROM official_naics_factors
            WHERE naics_code = %s
                OR UPPER(description) = %s
            LIMIT 1
            """,
            (token, token),
        )
        official_exact = cur.fetchone()
        if official_exact:
            return {
                "query": keyword,
                "material_token": token,
                "tier": 2,
                "matches": [_official_factor_to_option(official_exact, "official_exact", "exact")],
            }

        # Tier 2: official NAICS factor search. TiDB may reject MySQL MATCH/AGAINST,
        # so use LIKE fallback instead of failing the whole request.
        try:
            cur.execute(
                """
                SELECT
                    naics_code,
                    description,
                    category,
                    kgco2e_per_usd,
                    data_source,
                    MATCH(description) AGAINST (%s IN NATURAL LANGUAGE MODE) AS score
                FROM official_naics_factors
                WHERE MATCH(description) AGAINST (%s IN NATURAL LANGUAGE MODE)
                ORDER BY score DESC, naics_code
                LIMIT 10
                """,
                (token, token),
            )
        except MySQLError as exc:
            _log_db_error("Official NAICS fulltext search failed; falling back to LIKE search", exc, token=token)
            search_terms = [part for part in re.split(r"\s+", token) if len(part) >= 2] or [token]
            where_clause = " OR ".join(["UPPER(description) LIKE %s"] * len(search_terms))
            cur.execute(
                f"""
                SELECT naics_code, description, category, kgco2e_per_usd, data_source
                FROM official_naics_factors
                WHERE {where_clause}
                ORDER BY naics_code
                LIMIT 10
                """,
                tuple(f"%{term}%" for term in search_terms),
            )
        rows = cur.fetchall() or []
        if rows:
            return {
                "query": keyword,
                "material_token": token,
                "tier": 2,
                "matches": [_official_factor_to_option(row, "official_fulltext", "partial") for row in rows],
            }

        return {
            "query": keyword,
            "material_token": token,
            "tier": 3,
            "matches": [],
        }
    except HTTPException:
        raise
    except MySQLError as exc:
        _log_db_error(
            "NAICS tier search database failure",
            exc,
            keyword=keyword,
            token=token,
            user_id=user_id,
        )
        return {
            "query": keyword,
            "material_token": token,
            "tier": 3,
            "matches": [],
            "error": f"Database search failed: {exc}",
        }
    finally:
        if "cur" in locals() and cur:
            cur.close()
        if "conn" in locals() and conn:
            conn.close()


def suggest_naics_with_llm(material: str) -> dict:
    token = _normalize_material_token(material)
    if not token:
        raise HTTPException(status_code=400, detail="Material token is required.")

    api_key = os.getenv("OPENAI_API_KEY") or os.getenv("AI_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY or AI_KEY is not configured.")

    try:
        from openai import OpenAI
    except ImportError as exc:
        raise HTTPException(status_code=500, detail=f"OpenAI dependency missing: {exc}") from exc

    prompt = (
        "What is the most likely 6-digit NAICS code for the raw material "
        f"'{token}' in precision engineering? Return ONLY the 6-digit code."
    )

    try:
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            max_tokens=12,
        )
        content = response.choices[0].message.content if response.choices else ""
        suggested_code = re.search(r"\b\d{6}\b", content or "")
        if not suggested_code:
            raise ValueError("OpenAI did not return a 6-digit NAICS code.")

        return {
            "material_token": token,
            "suggested_naics": suggested_code.group(0),
            "source": "openai",
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("OpenAI NAICS suggestion failed for material=%r token=%r: %s", material, token, exc)
        raise HTTPException(status_code=502, detail=f"OpenAI NAICS suggestion failed: {exc}") from exc


def confirm_naics_mapping(
    material_token: str,
    mapped_naics: str,
    user_id: str = DEFAULT_USER_ID,
) -> dict:
    token = _normalize_material_token(material_token)
    code = str(mapped_naics or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="material_token is required.")
    if token.isdigit():
        raise HTTPException(status_code=400, detail="material_token cannot be only digits.")
    if not re.fullmatch(r"\d{6}", code):
        raise HTTPException(status_code=400, detail="Invalid NAICS Code")

    try:
        conn = get_conn()
        cur = conn.cursor(dictionary=True)

        cur.execute(
            """
            SELECT naics_code, description, category, kgco2e_per_usd, data_source
            FROM official_naics_factors
            WHERE naics_code = %s
            LIMIT 1
            """,
            (code,),
        )
        official = cur.fetchone()
        if not official:
            raise HTTPException(status_code=400, detail="Invalid NAICS Code")

        cur.execute(
            """
            INSERT INTO user_custom_dictionary
                (user_id, material_token, mapped_naics)
            VALUES
                (%s, %s, %s)
            ON DUPLICATE KEY UPDATE
                mapped_naics = VALUES(mapped_naics)
            """,
            (user_id, token, code),
        )
        conn.commit()

        return {
            "status": "success",
            "material_token": token,
            "mapping": _official_factor_to_option(official, "user_custom_dictionary", "confirmed"),
        }
    except HTTPException:
        if "conn" in locals() and conn:
            conn.rollback()
        raise
    except MySQLError as exc:
        _log_db_error(
            "Failed to save NAICS mapping",
            exc,
            material_token=token,
            mapped_naics=code,
            user_id=user_id,
        )
        if "conn" in locals() and conn:
            conn.rollback()
        raise HTTPException(status_code=503, detail=f"Failed to save NAICS mapping: {exc}") from exc
    finally:
        if "cur" in locals() and cur:
            cur.close()
        if "conn" in locals() and conn:
            conn.close()



def get_naics_factor_by_code(naics_code: str) -> dict:
    code = str(naics_code or "").strip()
    if not re.fullmatch(r"\d{6}", code):
        raise HTTPException(status_code=400, detail="Invalid NAICS Code")

    try:
        conn = get_conn()
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            SELECT naics_code, description, category, kgco2e_per_usd, data_source
            FROM official_naics_factors
            WHERE naics_code = %s
            LIMIT 1
            """,
            (code,),
        )
        official = cur.fetchone()
        if not official:
            raise HTTPException(status_code=404, detail="NAICS Code not found")

        return _official_factor_to_option(official, "official_exact", "exact")
    except HTTPException:
        raise
    except MySQLError as exc:
        _log_db_error("Failed to fetch NAICS factor by code", exc, naics_code=code)
        raise HTTPException(status_code=503, detail=f"Failed to fetch NAICS factor: {exc}") from exc
    finally:
        if "cur" in locals() and cur:
            cur.close()
        if "conn" in locals() and conn:
            conn.close()


def fetch_naics_for_material(name: str) -> dict:
    result = search_naics_mappings(name)
    if result["matches"]:
        return result["matches"][0]

    return {
        "code": "",
        "description": "Not Found - Please manual entry",
        "source": "phase3",
        "confidence": "low",
    }


def save_material_mapping(keyword: str, naics_code: str, description: str = "", category: str = ""):
    return confirm_naics_mapping(keyword, naics_code)


def list_naics_options(category: Optional[str] = None) -> list[dict]:
    """
    List available NAICS codes with descriptions from official_naics_factors.
    """
    try:
        conn = get_conn()
    except MySQLError as exc:
        _log_db_error("Database unavailable while listing NAICS options", exc)
        raise HTTPException(status_code=503, detail=f"Database unavailable: {exc}") from exc

    try:
        cur = conn.cursor(dictionary=True)
        params: tuple[object, ...] = ()
        category_filter = ""
        if category:
            category_filter = "WHERE category = %s"
            params = (category,)

        cur.execute(
            f"""
            SELECT naics_code, description, category, kgco2e_per_usd, data_source
            FROM official_naics_factors
            {category_filter}
            ORDER BY naics_code
            """,
            params,
        )

        options: list[dict] = []
        for row in cur.fetchall() or []:
            code = str(row.get("naics_code", "")).strip()
            if not code:
                continue

            option: dict = {
                "code": code,
                "description": row.get("description", f"NAICS {code}"),
                "category": row.get("category"),
                "data_source": row.get("data_source"),
            }
            if row.get("kgco2e_per_usd") is not None:
                option["kgco2e_per_usd"] = float(row["kgco2e_per_usd"])
            options.append(option)

        return options
    except MySQLError as exc:
        _log_db_error("Failed to list NAICS options from official_naics_factors", exc, category=category)
        raise HTTPException(status_code=503, detail=f"Failed to list NAICS options: {exc}") from exc
    finally:
        if "cur" in locals() and cur:
            cur.close()
        conn.close()


def get_kgco2e_per_usd(naics_code: str) -> float:
    """
    Read kgCO2e per USD from official_naics_factors for a given NAICS code.
    """
    code = str(naics_code or "").strip()
    try:
        conn = get_conn()
    except MySQLError as exc:
        _log_db_error("Database unavailable while loading NAICS factor", exc, naics_code=code)
        raise HTTPException(status_code=503, detail=f"Database unavailable: {exc}") from exc

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
        raise HTTPException(status_code=503, detail=f"Failed to load NAICS factor: {exc}") from exc
    finally:
        if "cur" in locals() and cur:
            cur.close()
        conn.close()


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
        raise HTTPException(status_code=503, detail=f"Database unavailable: {exc}") from exc

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
            kgco2e_per_usd = factor["kgco2e_per_usd"]
            results.append({
                **row,
                "mapped_naics": code,
                "naics_description": factor["description"],
                "kgco2e_per_usd": kgco2e_per_usd,
                "data_source": factor["data_source"],
                "total_kgco2e": amount * kgco2e_per_usd,
            })

        return results
    except HTTPException:
        raise
    except MySQLError as exc:
        _log_db_error("Batch calculation database failure", exc, naics_codes=naics_codes)
        raise HTTPException(status_code=503, detail=f"Batch calculation database failed: {exc}") from exc
    finally:
        if "cur" in locals() and cur:
            cur.close()
        conn.close()


def compute_emissions(payload: dict) -> dict:
    """
    Calculate emissions using exchange rates, inflation indices, and official NAICS factors.
    """
    year = int(payload["year"])
    naics = payload["naics"]
    sgd_amounts = payload["sgd_amounts"]

    fx_rate, inflation_index = get_fx_and_inflation(year)
    try:
        _, index_2022 = get_fx_and_inflation(2022)
    except Exception as exc:
        logger.exception("Failed to load 2022 inflation baseline; using default 118.012: %s", exc)
        index_2022 = 118.012

    inflation_ratio = index_2022 / inflation_index

    raw_factor = get_kgco2e_per_usd(naics["raw_material"])
    fab_factor = get_kgco2e_per_usd(naics["fabrication"])
    surf_factor = get_kgco2e_per_usd(naics["surface_treatment"])

    results = {}
    total_emission = 0.0

    for key, factor in [
        ("raw_material", raw_factor),
        ("fabrication", fab_factor),
        ("surface_treatment", surf_factor),
    ]:
        amt_sgd = float(sgd_amounts.get(key, 0))
        amt_usd = amt_sgd * fx_rate
        amt_usd2022 = amt_usd * inflation_ratio
        emission = amt_usd2022 * factor

        results[key] = {
            "sgd": amt_sgd,
            "usd": amt_usd,
            "usd2022": amt_usd2022,
            "factor": factor,
            "emission": emission,
        }
        total_emission += emission

    return {
        "calculation": {
            "fx_rate": fx_rate,
            "inflation_index": inflation_index,
            "year": year,
            "sgd_amounts": {k: v["sgd"] for k, v in results.items()},
            "usd_amounts": {k: v["usd"] for k, v in results.items()},
            "usd2022_amounts": {k: v["usd2022"] for k, v in results.items()},
            "factors": {k: v["factor"] for k, v in results.items()},
        },
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


def _find_first_number(value: object, key_fragments: tuple[str, ...]) -> float | None:
    if isinstance(value, dict):
        for key, nested in value.items():
            key_lower = str(key).lower()
            if all(fragment in key_lower for fragment in key_fragments):
                try:
                    return float(nested)
                except (TypeError, ValueError):
                    pass
            found = _find_first_number(nested, key_fragments)
            if found is not None:
                return found
    elif isinstance(value, list):
        for item in value:
            found = _find_first_number(item, key_fragments)
            if found is not None:
                return found
    return None


def calculate_ecotransit_transport(
    port_of_loading: str,
    port_of_discharge: str,
    weight_kg: float,
    transport_mode: str,
    origin_country: str | None = None,
) -> dict:
    api_url = os.getenv("ECOTRANSIT_API_URL", "").strip()
    api_token = os.getenv("ECOTRANSIT_API_TOKEN", "").strip()

    if not api_url or not api_token:
        raise HTTPException(
            status_code=503,
            detail=(
                "EcoTransit API is not configured. Add ECOTRANSIT_API_URL and "
                "ECOTRANSIT_API_TOKEN to api/.env. EcoTransit lists its REST API "
                "as a Business Solutions interface, so a licensed endpoint/token is required."
            ),
        )

    weight_tons = weight_kg / 1000.0
    request_payload = {
        "transportID": f"PE-{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}",
        "cargo": {
            "unit": "TONS",
            "amount": weight_tons,
        },
        "transportChainElements": [
            {
                "mainCarriage": True,
                "transportMode": transport_mode.upper(),
                "from": {
                    "locationType": "PORT",
                    "name": port_of_loading,
                    **({"country": origin_country} if origin_country else {}),
                },
                "to": {
                    "locationType": "PORT",
                    "name": port_of_discharge,
                    "country": "Singapore" if port_of_discharge.lower() == "singapore" else "",
                },
            }
        ],
    }

    request = Request(
        api_url,
        data=json.dumps(request_payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=30) as response:
            raw_response = json.loads(response.read().decode("utf-8", errors="replace"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace") or exc.reason
        raise HTTPException(status_code=502, detail=f"EcoTransit API error: {detail}") from exc
    except URLError as exc:
        raise HTTPException(status_code=502, detail=f"Could not reach EcoTransit API: {exc.reason}") from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="EcoTransit API returned invalid JSON") from exc

    co2e_kg = (
        _find_first_number(raw_response, ("co2e",))
        or _find_first_number(raw_response, ("co2", "equivalent"))
        or _find_first_number(raw_response, ("ghg",))
        or _find_first_number(raw_response, ("emission",))
    )
    distance_km = _find_first_number(raw_response, ("distance",))
    energy_mj = _find_first_number(raw_response, ("energy",))

    return {
        "transport": {
            "origin": origin_country or port_of_loading,
            "port_of_loading": port_of_loading,
            "port_of_discharge": port_of_discharge,
            "weight_kg": weight_kg,
            "chosen_mode": transport_mode,
            "chosen_emissions_kg": co2e_kg,
            "distance_km": distance_km,
            "energy_mj": energy_mj,
            "source": "EcoTransit World",
            "raw": raw_response,
        }
    }
