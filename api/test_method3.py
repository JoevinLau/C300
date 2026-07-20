from __future__ import annotations

from datetime import date
from pathlib import Path
import sys
import unittest

API_DIR = Path(__file__).resolve().parent
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from services.method3 import (
    Method3ReferenceDataUnavailable,
    calculate_method3,
    get_method3_basis,
)


def method3_executor(sql, params=(), *, fetch="all"):
    normalized = " ".join(sql.split())
    if "FROM ceda_dataset_versions d JOIN ceda_emission_factors" in normalized:
        return {
            "dataset_version": "CEDA 2025",
            "reference_price_year": 2025,
            "currency": "SGD",
            "price_basis": "purchaser_price",
            "factor_source": "Open CEDA",
            "country_code": "CHN",
            "country_name": "China",
            "sector_code": "331313",
            "sector_name": "Alumina refining and primary aluminum production",
            "purchase_type": "imported_raw_material",
            "purchase_type_label": "Imported Raw Material",
            "price_index_type": "import_manufactured_goods",
            "price_index_label": "Import Price Index - Manufactured Goods",
            "emission_factor": 1.741145,
            "factor_unit": "kgCO2e/SGD",
        }
    if "FROM singapore_price_indices" in normalized and "AVG(index_value)" not in normalized:
        return {
            "index_value": 98.5,
            "base_year": 2023,
            "source": "Singapore Department of Statistics; SingStat M213241",
        }
    if "AVG(index_value) AS reference_index" in normalized:
        return {
            "reference_index": 100.2,
            "month_count": 12,
            "min_base_year": 2023,
            "max_base_year": 2023,
            "source": "Singapore Department of Statistics; SingStat M213241",
        }
    raise AssertionError(f"Unexpected query: {normalized} {params} {fetch}")


class Method3CalculationTests(unittest.TestCase):
    def test_uses_annual_average_reference_index(self):
        basis = get_method3_basis(
        purchase_year=2026,
        purchase_month=5,
        purchase_type="imported_raw_material",
        country_code="CHN",
        sector_code="331313",
        executor=method3_executor,
        today=date(2026, 7, 21),
        )

        self.assertEqual(basis["reference_index_method"], "annual_average")
        self.assertAlmostEqual(basis["reference_index"], 100.2)
        self.assertAlmostEqual(basis["purchase_index"], 98.5)
        self.assertAlmostEqual(basis["emission_factor"], 1.741145)


    def test_calculation_matches_teacher_example(self):
        result = calculate_method3(
        {
            "invoice_id": "INV-2026-001",
            "purchase_description": "Imported aluminium block",
            "purchase_year": 2026,
            "purchase_month": 5,
            "invoice_amount_sgd": 20_000,
            "purchase_type": "imported_raw_material",
            "country_code": "CHN",
            "sector_code": "331313",
        },
        executor=method3_executor,
        today=date(2026, 7, 21),
        )

        self.assertAlmostEqual(result["normalized_spend_sgd"], 20_345.177665, places=5)
        self.assertAlmostEqual(result["adjustment_percent"], 1.7258883, places=6)
        self.assertAlmostEqual(
            result["estimated_emissions_kgco2e"],
            result["normalized_spend_sgd"] * 1.741145,
        )
        self.assertAlmostEqual(
            result["estimated_emissions_tco2e"],
            result["estimated_emissions_kgco2e"] / 1000,
        )


    def test_rejects_future_purchase_month_before_querying(self):
        def unexpected_executor(*_args, **_kwargs):
            raise AssertionError("Database should not be queried for a future month")

        with self.assertRaisesRegex(Method3ReferenceDataUnavailable, "not been published"):
            get_method3_basis(
            purchase_year=2026,
            purchase_month=8,
            purchase_type="imported_raw_material",
            country_code="CHN",
            sector_code="331313",
            executor=unexpected_executor,
            today=date(2026, 7, 21),
            )


    def test_requires_all_twelve_reference_months(self):
        def incomplete_executor(sql, params=(), *, fetch="all"):
            result = method3_executor(sql, params, fetch=fetch)
            if "AVG(index_value) AS reference_index" in " ".join(sql.split()):
                return {**result, "month_count": 11}
            return result

        with self.assertRaisesRegex(Method3ReferenceDataUnavailable, "annual-average reference index is incomplete"):
            get_method3_basis(
            purchase_year=2026,
            purchase_month=5,
            purchase_type="imported_raw_material",
            country_code="CHN",
            sector_code="331313",
            executor=incomplete_executor,
            today=date(2026, 7, 21),
            )


if __name__ == "__main__":
    unittest.main()
