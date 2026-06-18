#service.py
from typing import Tuple, Optional
from pathlib import Path
from functools import lru_cache
from difflib import SequenceMatcher


import mysql.connector
from fastapi import HTTPException
from mysql.connector import Error as MySQLError

from db import get_conn
from dev_data import DEV_NAICS_OPTIONS, DEV_FX_INFLATION



def get_fx_and_inflation(year: int) -> Tuple[float, float]:
    """
    Read SGD->USD rate and US inflation index from database for a given year.
    Falls back to dev_data when cloud database is unavailable.
    Returns (fx_rate, inflation_index)
    """
    try:
        conn = get_conn()
    except MySQLError:
        # Fallback to dev data
        values = DEV_FX_INFLATION.get(year)
        if values:
            return values
        raise HTTPException(status_code=400, detail=f"No exchange rate for year {year}")

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



import re
import json
import os
from urllib.parse import quote_plus
from urllib.request import urlopen

BASE_DIR = Path(__file__).resolve().parent
LOCAL_SHORTFORM_PATH = BASE_DIR / "material_shortforms.local.json"
USE_DB_FOR_NAICS = os.getenv("USE_DB_FOR_NAICS", "0") == "1"



def _normalize_keyword(keyword: str) -> str:
    return clean_material_name(keyword).lower().strip()


def _load_local_shortforms() -> dict[str, dict]:
    if not LOCAL_SHORTFORM_PATH.exists():
        return {}

    try:
        payload = json.loads(LOCAL_SHORTFORM_PATH.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"Failed to read local shortforms JSON: {e}")
        return {}

    mappings = payload.get("mappings", []) if isinstance(payload, dict) else []
    result: dict[str, dict] = {}
    for item in mappings:
        if not isinstance(item, dict):
            continue
        keyword = _normalize_keyword(str(item.get("keyword", "")))
        if not keyword:
            continue
        result[keyword] = {
            "keyword": keyword,
            "code": str(item.get("naics_code", "") or "").strip(),
            "description": str(item.get("description", "") or "").strip(),
            "category": str(item.get("category", "") or "").strip(),
        }
    return result


def _save_local_shortforms(data: dict[str, dict]) -> None:
    payload = {
        "mappings": [
            {
                "keyword": k,
                "naics_code": v.get("code", ""),
                "description": v.get("description", ""),
                "category": v.get("category", ""),
            }
            for k, v in sorted(data.items())
        ]
    }
    LOCAL_SHORTFORM_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _upsert_local_mapping(keyword: str, naics_code: str, description: str, category: str) -> None:
    normalized = _normalize_keyword(keyword)
    if not normalized:
        return

    current = _load_local_shortforms()
    current[normalized] = {
        "keyword": normalized,
        "code": str(naics_code or "").strip(),
        "description": str(description or "").strip(),
        "category": str(category or "").strip(),
    }
    try:
        _save_local_shortforms(current)
    except Exception as e:
        print(f"Failed to write local shortforms JSON: {e}")


def _find_in_local_dictionary(keyword: str) -> Optional[dict]:
    normalized = _normalize_keyword(keyword)
    if not normalized:
        return None

    mappings = _load_local_shortforms()

    row = mappings.get(normalized)
    if not row:
        for k, v in mappings.items():
            if normalized in k or k in normalized:
                row = v
                break

    if not row:
        return None

    return {
        "code": row.get("code", ""),
        "description": row.get("description", ""),
        "category": row.get("category", ""),
        "source": "phase1",
        "confidence": "exact",
    }


def clean_material_name(name: str) -> str:

    """
    Remove dimensions and extra details from material name to isolate the core keyword.
    Example: 'S50C 4.7 x 142 x 303' -> 'S50C'
    """
    if not name:
        return ""
    # Remove dimension patterns like 4.7 x 142 x 303 or 50 x 300 x 300
    cleaned = re.sub(r'\d+(\.\d+)?\s*[xX*]\s*\d+(\.\d+)?\s*[xX*]\s*\d+(\.\d+)?', '', name)
    # Remove single dimensions like 35 x 180
    cleaned = re.sub(r'\d+(\.\d+)?\s*[xX*]\s*\d+(\.\d+)?', '', cleaned)
    # Remove trailing units like mm, cm
    cleaned = re.sub(r'\d+(\.\d+)?\s*(mm|cm|m|inch|in)\b', '', cleaned, flags=re.IGNORECASE)
    # Strip extra whitespace
    cleaned = cleaned.strip()
    # Take first word or first part if comma/semicolon separated
    cleaned = re.split(r'[,;]', cleaned)[0].strip()
    return cleaned

def find_in_dictionary(keyword: str) -> Optional[dict]:
    """
    Phase 1: Search in local JSON dictionary first, then MySQL material_shortforms.
    """
    local_hit = _find_in_local_dictionary(keyword)
    if local_hit:
        return local_hit

    try:
        conn = get_conn()
        cur = conn.cursor(dictionary=True)
        cur.execute(
            "SELECT naics_code as code, description, category FROM material_shortforms WHERE keyword = %s",
            (keyword,),
        )
        row = cur.fetchone()
        if not row:
            # Try fuzzy match if exact fails
            cur.execute(
                "SELECT naics_code as code, description, category FROM material_shortforms WHERE %s LIKE CONCAT('%', keyword, '%')",
                (keyword,),
            )
            row = cur.fetchone()

        if row:
            _upsert_local_mapping(
                keyword=keyword,
                naics_code=str(row.get("code", "") or ""),
                description=str(row.get("description", "") or ""),
                category=str(row.get("category", "") or ""),
            )
            row["source"] = "phase1"
            row["confidence"] = "exact"
            return row
    except Exception as e:
        print(f"Dictionary search failed: {e}")
    finally:
        if "conn" in locals() and conn:
            conn.close()
    return None


PHASE1_RULES: dict[str, list[str]] = {
    # steel
    "331110": [
        "DF2",
        "S STAR",
        "S-STAR",
        "SSTAR",
        "2316",
        "S50C",
        "SKD11",
        "SKD61",
        "P20",
        "H13",
        "MILD STEEL",
        "CARBON STEEL",
        "STEEL",
    ],
    # stainless steel
    "331221": ["SUS", "SS", "STS", "STAINLESS", "STAINLESS STEEL"],
    # aluminum
    "331318": ["ALU", "AL", "6061", "5052", "7075", "ALUMINUM", "ALUMINIUM"],
    # plastics
    "326199": ["PLASTIC", "PLASTICS", "POLYMER", "POM", "ABS", "PVC", "NYLON", "PP", "PE", "PTFE"],
    # brass/copper
    "331421": ["BRASS", "COPPER", "CU", "C260", "C360"],
}


@lru_cache(maxsize=1)
def _load_naics_candidates() -> list[dict]:
    """
    Load NAICS candidates once and reuse in-memory for fast matching.
    """
    if USE_DB_FOR_NAICS:
        try:
            conn = get_conn()
            cur = conn.cursor(dictionary=True)
            cur.execute(
                """
                SELECT naics_code, naics_description, category
                FROM naics_factors
                ORDER BY naics_code
                """
            )
            rows = cur.fetchall() or []
            candidates = [
                {
                    "code": str(r.get("naics_code", "") or "").strip(),
                    "description": str(r.get("naics_description", "") or "").strip(),
                    "category": str(r.get("category", "") or "").strip(),
                }
                for r in rows
                if str(r.get("naics_code", "") or "").strip()
            ]
            if candidates:
                return candidates
        except Exception as e:
            print(f"Load NAICS candidates from DB failed: {e}")
        finally:
            if "conn" in locals() and conn:
                conn.close()

    return [
        {
            "code": item["code"],
            "description": item["description"],
            "category": item.get("category", ""),
        }
        for item in DEV_NAICS_OPTIONS
    ]


def _candidate_by_code(code: str) -> Optional[dict]:
    for item in _load_naics_candidates():
        if item["code"] == code:
            return item
    return None


def _tokenize_upper(text: str) -> set[str]:
    return {t for t in re.findall(r"[A-Z0-9]+", text.upper()) if t}


def _classify_by_keywords(text: str) -> Optional[dict]:
    upper = text.upper()
    tokens = _tokenize_upper(text)

    # Ensure stainless takes priority over generic steel
    ordered_codes = ["331221", "331318", "331421", "326199", "331110"]
    for code in ordered_codes:
        keywords = PHASE1_RULES.get(code, [])
        for kw in keywords:
            kw_upper = kw.upper()
            if " " in kw_upper or "-" in kw_upper:
                if kw_upper in upper:
                    return {"code": code, "matched_keyword": kw}
            else:
                if kw_upper in tokens:
                    return {"code": code, "matched_keyword": kw}
    return None


def _format_match_result(code: str, source: str, confidence: str = "exact") -> dict:
    hit = _candidate_by_code(code)
    return {
        "code": code,
        "description": (hit or {}).get("description", f"NAICS {code}"),
        "category": (hit or {}).get("category", ""),
        "source": source,
        "confidence": confidence,
    }


def find_via_phase1_keywords(material_name: str) -> Optional[dict]:
    """
    Phase 1: keyword scanning (fast deterministic mapping).
    """
    text = clean_material_name(material_name).strip()
    if not text:
        return None

    result = _classify_by_keywords(text)
    if not result:
        return None

    return _format_match_result(result["code"], source="phase1", confidence="exact")


def _fetch_online_context(material_name: str) -> str:
    snippets: list[str] = []
    timeout = 2

    # DuckDuckGo Instant Answer
    try:
        ddg_url = (
            "https://api.duckduckgo.com/?q="
            + quote_plus(f"{material_name} material type")
            + "&format=json&no_redirect=1&no_html=1"
        )
        with urlopen(ddg_url, timeout=timeout) as resp:
            payload = json.loads(resp.read().decode("utf-8", errors="ignore"))
            if payload.get("AbstractText"):
                snippets.append(str(payload.get("AbstractText")))
            for topic in payload.get("RelatedTopics", [])[:5]:
                if isinstance(topic, dict) and topic.get("Text"):
                    snippets.append(str(topic.get("Text")))
    except Exception:
        pass

    # Wikipedia OpenSearch fallback
    try:
        wiki_url = (
            "https://en.wikipedia.org/w/api.php?action=opensearch&limit=5&namespace=0&format=json&search="
            + quote_plus(material_name)
        )
        with urlopen(wiki_url, timeout=timeout) as resp:
            payload = json.loads(resp.read().decode("utf-8", errors="ignore"))
            if isinstance(payload, list) and len(payload) >= 3 and isinstance(payload[2], list):
                snippets.extend(str(x) for x in payload[2] if x)
    except Exception:
        pass

    return " ".join(snippets)


def find_via_phase2_online_lookup(material_name: str) -> Optional[dict]:
    """
    Phase 2: online lookup + keyword classification into broad material families.
    """
    base_text = clean_material_name(material_name).strip()
    if not base_text:
        return None

    context = _fetch_online_context(base_text)
    combined = f"{base_text} {context}".strip()

    # First classify using known keyword families
    result = _classify_by_keywords(combined)
    if result:
        return _format_match_result(result["code"], source="phase2", confidence="partial")

    # Then fallback to NAICS description match/fuzzy
    text = combined.lower()
    candidates = _load_naics_candidates()
    for item in candidates:
        desc = item["description"].lower()
        if text and (text in desc or any(token and token in desc for token in text.split())):
            return {
                "code": item["code"],
                "description": item["description"],
                "category": item.get("category", ""),
                "source": "phase2",
                "confidence": "partial",
            }

    best: Optional[dict] = None
    best_score = 0.0
    for item in candidates:
        score = SequenceMatcher(None, text, item["description"].lower()).ratio()
        if score > best_score:
            best_score = score
            best = item

    if best and best_score >= 0.45:
        return {
            "code": best["code"],
            "description": best["description"],
            "category": best.get("category", ""),
            "source": "phase2",
            "confidence": "partial",
        }

    return None



def fetch_naics_for_material(name: str) -> dict:
    """
    Three-phase NAICS lookup.
    Phase 1: keyword scan + local dictionary
    Phase 2: online lookup + classification
    Phase 3: blank for manual entry
    """
    keyword = clean_material_name(name)

    # Phase 1a: keyword scan
    result = find_via_phase1_keywords(name)

    # Phase 1b: local shortform dictionary
    if not result:
        result = find_in_dictionary(keyword)

    # Phase 2: online lookup + classification
    if not result:
        result = find_via_phase2_online_lookup(name)

    # Phase 3: final fallback
    if not result:
        result = {
            "code": "",
            "description": "Not Found - Please manual entry",
            "category": "",
            "source": "phase3",
            "confidence": "low",
        }

    
    # Enrichment: optional DB enrich (disabled by default for speed)
    if USE_DB_FOR_NAICS and result.get('code'):
        try:
            conn = get_conn()
            cur = conn.cursor(dictionary=True)
            cur.execute(
                "SELECT naics_description as description, category, kgco2e_per_usd FROM naics_factors WHERE naics_code = %s",
                (result['code'],)
            )
            row = cur.fetchone()
            if row:
                # Update with database values if found
                result['description'] = row.get('description') or result.get('description')
                result['category'] = row.get('category') or result.get('category')
                result['kgco2e'] = row.get('kgco2e_per_usd')
        except Exception as e:
            print(f"Enrichment failed: {e}")
        finally:
            if 'conn' in locals() and conn:
                conn.close()

                
    return result


def save_material_mapping(keyword: str, naics_code: str, description: str, category: str):
    """
    Save or update a material mapping in local JSON dictionary and MySQL.
    """
    _upsert_local_mapping(keyword, naics_code, description, category)

    if not USE_DB_FOR_NAICS:
        return

    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO material_shortforms (keyword, naics_code, description, category)
            VALUES (%s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
            naics_code = VALUES(naics_code),
            description = VALUES(description),
            category = VALUES(category)
            """,
            (keyword, naics_code, description, category),
        )
        conn.commit()
    except Exception as e:
        print(f"Save to MySQL failed, local JSON already updated: {e}")
    finally:
        if "conn" in locals() and conn:
            conn.close()



def list_naics_options(category: Optional[str] = None) -> list[dict]:

    """
    List available NAICS codes with descriptions from database.
    Falls back to dev_data when cloud database is unavailable.
    Optionally filter by category (raw_material, fabrication, surface_treatment).
    """
    try:
        conn = get_conn()
    except MySQLError:
        # Fallback to dev data
        if category:
            return [n for n in DEV_NAICS_OPTIONS if n["category"] == category]
        return DEV_NAICS_OPTIONS

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
            return DEV_NAICS_OPTIONS if not category else [n for n in DEV_NAICS_OPTIONS if n["category"] == category]

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

        return options if options else (DEV_NAICS_OPTIONS if not category else [n for n in DEV_NAICS_OPTIONS if n["category"] == category])
    finally:
        conn.close()


def get_kgco2e_per_usd(naics_code: str) -> float:
    """
    Read kgCO2e per USD from naics_factors for a given NAICS code.
    Falls back to dev_data when cloud database is unavailable.
    """
    try:
        conn = get_conn()
    except MySQLError:
        # Fallback to dev data
        for item in DEV_NAICS_OPTIONS:
            if item["code"] == naics_code:
                return item["kgco2e_per_usd"]
        raise HTTPException(status_code=400, detail=f"No emission factor for NAICS code " + naics_code)

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


def compute_emissions(payload: dict) -> dict:
    """
    使用数据库中的汇率、通胀指数和 NAICS 系数计算排放量。
    """
    year = int(payload["year"])
    naics = payload["naics"]
    sgd_amounts = payload["sgd_amounts"]

    # 1. 获取财务数据 (汇率和通胀)
    fx_rate, inflation_index = get_fx_and_inflation(year)
    try:
        # 获取 2022 年的指数作为基准 (USEEIO 系数通常基于 2022 美元)
        _, index_2022 = get_fx_and_inflation(2022)
    except Exception:
        index_2022 = 118.012  # 默认回退值

    inflation_ratio = index_2022 / inflation_index

    # 2. 获取排放系数 (kgCO2e per 2022 USD)
    raw_factor = get_kgco2e_per_usd(naics["raw_material"])
    fab_factor = get_kgco2e_per_usd(naics["fabrication"])
    surf_factor = get_kgco2e_per_usd(naics["surface_treatment"])

    # 3. 计算各部分结果
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

