from __future__ import annotations

from datetime import datetime
import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import HTTPException
from mysql.connector import Error as MySQLError

from calculation.transport_data import DISTANCES_TO_SINGAPORE_KM, EMISSION_FACTORS_KG_PER_TKM
from db import get_conn
from services.common import log_db_error as _log_db_error


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
            "estimated": False,
            "raw": raw_response,
        }
    }

def _normalized_transport_mode(transport_mode: str) -> str:
    mode = transport_mode.lower().strip()
    if mode in {"vessel", "ship"}:
        return "sea"
    if mode in {"truck", "road"}:
        return "land"
    return mode


def _local_transport_factor(transport_mode: str) -> tuple[float, str]:
    mode = _normalized_transport_mode(transport_mode)
    db_modes = {
        "sea": ("sea", "vessel", "ship"),
        "land": ("land", "truck"),
        "air": ("air",),
        "rail": ("rail",),
    }.get(mode, (mode,))

    try:
        conn = get_conn()
        try:
            cur = conn.cursor(dictionary=True)
            try:
                placeholders = ", ".join(["%s"] * len(db_modes))
                cur.execute(
                    f"""
                    SELECT transport_mode, kgco2e_per_tonne_km, data_source
                    FROM method2_transport_emission_factors
                    WHERE transport_mode IN ({placeholders})
                    ORDER BY valid_from DESC, id DESC
                    LIMIT 1
                    """,
                    db_modes,
                )
                row = cur.fetchone()
            finally:
                cur.close()
        finally:
            conn.close()
        if row:
            return float(row["kgco2e_per_tonne_km"]), str(row["data_source"])
    except MySQLError as exc:
        _log_db_error("Database unavailable while loading transport factor", exc, transport_mode=mode)

    factor = EMISSION_FACTORS_KG_PER_TKM.get(mode)
    if factor is None:
        raise HTTPException(status_code=400, detail=f"Unsupported transport mode: {transport_mode}")
    return factor, "local transport reference data"


def calculate_local_transport_estimate(
    port_of_loading: str,
    port_of_discharge: str,
    weight_kg: float,
    transport_mode: str,
    origin_country: str | None = None,
) -> dict:
    origin = (origin_country or port_of_loading).strip()
    distance_km = DISTANCES_TO_SINGAPORE_KM.get(origin)
    if distance_km is None:
        raise HTTPException(
            status_code=400,
            detail=f"No local transport distance is available for '{origin}'.",
        )

    factor, factor_source = _local_transport_factor(transport_mode)
    weight_tonnes = weight_kg / 1000.0
    co2e_kg = weight_tonnes * distance_km * factor

    return {
        "transport": {
            "origin": origin,
            "port_of_loading": port_of_loading,
            "port_of_discharge": port_of_discharge,
            "weight_kg": weight_kg,
            "chosen_mode": _normalized_transport_mode(transport_mode),
            "chosen_emissions_kg": co2e_kg,
            "distance_km": distance_km,
            "energy_mj": None,
            "source": f"Local estimate ({factor_source})",
            "estimated": True,
            "raw": {
                "method": "weight_tonnes * distance_km * kgco2e_per_tonne_km",
                "weight_tonnes": weight_tonnes,
                "distance_km": distance_km,
                "kgco2e_per_tonne_km": factor,
                "factor_source": factor_source,
            },
        }
    }
