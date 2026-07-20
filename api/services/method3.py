from __future__ import annotations

from calendar import month_name
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Callable, Sequence

try:
    from db import execute_with_retry
except ModuleNotFoundError:
    from api.db import execute_with_retry


class Method3ReferenceDataUnavailable(RuntimeError):
    """Raised when an authoritative Method 3 factor or price index is unavailable."""


QueryExecutor = Callable[..., Any]


def _query(
    sql: str,
    params: Sequence[Any] = (),
    *,
    fetch: str = "all",
    executor: QueryExecutor = execute_with_retry,
) -> Any:
    return executor(sql, params, fetch=fetch)


def _float(value: Any, label: str) -> float:
    if value is None:
        raise Method3ReferenceDataUnavailable(f"{label} is unavailable.")
    if isinstance(value, Decimal):
        value = float(value)
    result = float(value)
    if result <= 0:
        raise Method3ReferenceDataUnavailable(f"{label} must be greater than zero.")
    return result


def list_method3_reference_data(*, executor: QueryExecutor = execute_with_retry) -> dict[str, Any]:
    dataset = _query(
        """
        SELECT version_code, release_date, reference_price_year, currency_code,
               price_basis, attribution
        FROM ceda_dataset_versions
        WHERE is_active = TRUE
        ORDER BY imported_at DESC
        LIMIT 1
        """,
        fetch="one",
        executor=executor,
    )
    if not dataset:
        raise Method3ReferenceDataUnavailable(
            "No active Open CEDA dataset is available. Run scripts/import_open_ceda.py first."
        )

    countries = _query(
        """
        SELECT DISTINCT c.country_code AS code, c.country_name AS name
        FROM ceda_countries c
        JOIN ceda_emission_factors f ON f.country_code = c.country_code
        JOIN ceda_dataset_versions d ON d.id = f.dataset_version_id
        WHERE d.is_active = TRUE
        ORDER BY c.country_name
        """,
        executor=executor,
    )
    sectors = _query(
        """
        SELECT DISTINCT s.sector_code AS code, s.sector_name AS name, s.naics_code
        FROM ceda_sectors s
        JOIN ceda_emission_factors f ON f.sector_code = s.sector_code
        JOIN ceda_dataset_versions d ON d.id = f.dataset_version_id
        WHERE d.is_active = TRUE
        ORDER BY s.sector_code
        """,
        executor=executor,
    )
    purchase_types = _query(
        """
        SELECT purchase_type_code AS code, display_name AS label,
               price_index_type, price_index_label
        FROM method3_purchase_types
        WHERE is_active = TRUE
        ORDER BY display_order, purchase_type_code
        """,
        executor=executor,
    )
    return {
        "dataset": {
            "version": dataset["version_code"],
            "release_date": (
                dataset["release_date"].isoformat()
                if dataset.get("release_date")
                else None
            ),
            "reference_price_year": int(dataset["reference_price_year"]),
            "currency": dataset["currency_code"],
            "price_basis": dataset["price_basis"],
            "attribution": dataset["attribution"],
        },
        "countries": countries,
        "sectors": sectors,
        "purchase_types": purchase_types,
    }


def get_method3_basis(
    *,
    purchase_year: int,
    purchase_month: int,
    purchase_type: str,
    country_code: str,
    sector_code: str,
    executor: QueryExecutor = execute_with_retry,
    today: date | None = None,
) -> dict[str, Any]:
    today = today or date.today()
    if (purchase_year, purchase_month) > (today.year, today.month):
        raise Method3ReferenceDataUnavailable(
            "Price index data for this month has not been published yet."
        )

    selection = _query(
        """
        SELECT d.version_code AS dataset_version, d.reference_price_year,
               d.currency_code AS currency, d.price_basis, d.source_name AS factor_source,
               c.country_code, c.country_name, s.sector_code, s.sector_name,
               p.purchase_type_code AS purchase_type, p.display_name AS purchase_type_label,
               p.price_index_type, p.price_index_label, f.factor_value AS emission_factor,
               f.factor_unit
        FROM ceda_dataset_versions d
        JOIN ceda_emission_factors f ON f.dataset_version_id = d.id
        JOIN ceda_countries c ON c.country_code = f.country_code
        JOIN ceda_sectors s ON s.sector_code = f.sector_code
        JOIN method3_purchase_types p ON p.purchase_type_code = %s AND p.is_active = TRUE
        WHERE d.is_active = TRUE
          AND f.country_code = %s
          AND f.sector_code = %s
          AND f.reference_price_year = d.reference_price_year
          AND f.currency_code = d.currency_code
          AND f.price_basis = d.price_basis
        LIMIT 1
        """,
        (purchase_type, country_code, sector_code),
        fetch="one",
        executor=executor,
    )
    if not selection:
        raise Method3ReferenceDataUnavailable(
            "No Open CEDA factor was found for the selected country and sector."
        )

    purchase_index = _query(
        """
        SELECT index_value, base_year, source
        FROM singapore_price_indices
        WHERE index_type = %s AND year = %s AND month = %s
        LIMIT 1
        """,
        (selection["price_index_type"], purchase_year, purchase_month),
        fetch="one",
        executor=executor,
    )
    if not purchase_index:
        raise Method3ReferenceDataUnavailable(
            "Price index data is not available for the selected purchase month. "
            "Please update the SingStat price index database."
        )

    reference = _query(
        """
        SELECT AVG(index_value) AS reference_index, COUNT(*) AS month_count,
               MIN(base_year) AS min_base_year, MAX(base_year) AS max_base_year,
               MAX(source) AS source
        FROM singapore_price_indices
        WHERE index_type = %s AND year = %s AND month BETWEEN 1 AND 12
        """,
        (selection["price_index_type"], selection["reference_price_year"]),
        fetch="one",
        executor=executor,
    )
    if (
        not reference
        or int(reference.get("month_count") or 0) != 12
        or reference.get("min_base_year") != reference.get("max_base_year")
    ):
        raise Method3ReferenceDataUnavailable(
            f"The {selection['reference_price_year']} annual-average reference index is incomplete. "
            "Please update the SingStat price index database."
        )

    return {
        **selection,
        "purchase_period": f"{month_name[purchase_month]} {purchase_year}",
        "purchase_index": _float(purchase_index["index_value"], "Purchase period index"),
        "reference_index": _float(reference["reference_index"], "Reference index"),
        "reference_index_method": "annual_average",
        "index_base_year": int(purchase_index["base_year"]),
        "emission_factor": _float(selection["emission_factor"], "CEDA emission factor"),
        "price_index_source": purchase_index["source"],
    }


def calculate_method3(
    payload: dict[str, Any],
    *,
    executor: QueryExecutor = execute_with_retry,
    today: date | None = None,
) -> dict[str, Any]:
    basis = get_method3_basis(
        purchase_year=int(payload["purchase_year"]),
        purchase_month=int(payload["purchase_month"]),
        purchase_type=str(payload["purchase_type"]),
        country_code=str(payload["country_code"]),
        sector_code=str(payload["sector_code"]),
        executor=executor,
        today=today,
    )
    original = float(payload["invoice_amount_sgd"])
    if original <= 0:
        raise ValueError("Invoice amount must be greater than zero.")

    adjustment_factor = basis["reference_index"] / basis["purchase_index"]
    normalized = original * adjustment_factor
    emissions = normalized * basis["emission_factor"]
    return {
        "invoice_id": str(payload["invoice_id"]).strip(),
        "purchase_description": str(payload["purchase_description"]).strip(),
        "original_spend_sgd": original,
        "normalized_spend_sgd": normalized,
        "adjustment_factor": adjustment_factor,
        "adjustment_percent": (adjustment_factor - 1.0) * 100.0,
        "estimated_emissions_kgco2e": emissions,
        "estimated_emissions_tco2e": emissions / 1000.0,
        "calculated_at": datetime.now(timezone.utc).isoformat(),
        "basis": basis,
    }
