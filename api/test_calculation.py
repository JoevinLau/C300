from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient


API_DIR = Path(__file__).resolve().parent
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

import main


FACTOR_BY_NAICS = {
    "331110": 0.25,
    "331315": 1.25,
    "332710": 0.50,
    "332812": 0.75,
    "332813": 1.50,
}


def calculation_payload() -> dict:
    return {
        "invoice_id": "NAICS-TEST",
        "year": 2024,
        "total_amount_sgd": 100.0,
        "sgd_amounts": {
            "raw_material": 60.0,
            "fabrication": 25.0,
            "surface_treatment": 15.0,
        },
        "allocation": {
            "raw_material_pct": 60.0,
            "fabrication_pct": 25.0,
            "surface_treatment_pct": 15.0,
        },
        "naics": {
            "raw_material": "331110",
            "fabrication": "332710",
            "surface_treatment": "332812",
        },
    }


def calculation_result(year: int) -> dict:
    category_amounts = {
        "raw_material": 60.0,
        "fabrication": 25.0,
        "surface_treatment": 15.0,
    }
    return {
        "calculation": {
            "fx_rate": 1.0,
            "inflation_index": 100.0,
            "year": year,
            "sgd_amounts": category_amounts,
            "usd_amounts": category_amounts,
            "usd2022_amounts": category_amounts,
            "factors": {
                "raw_material": 0.25,
                "fabrication": 0.50,
                "surface_treatment": 0.75,
            },
        },
        "costs": {
            "raw_material_usd2022": 60.0,
            "fabrication_usd2022": 25.0,
            "surface_treatment_usd2022": 15.0,
        },
        "emissions": {
            "raw_material": 15.0,
            "fabrication": 12.5,
            "surface_treatment": 11.25,
            "total": 38.75,
        },
    }


class CalculationApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(main.app)

    def factor_patches(self):
        return (
            patch(
                "service.get_fx_and_inflation",
                side_effect=lambda year: (1.0, 100.0),
            ),
            patch(
                "service.get_kgco2e_per_usd",
                side_effect=lambda code: FACTOR_BY_NAICS[code],
            ),
        )

    def test_selected_naics_codes_control_category_factors_and_emissions(self):
        payload = calculation_payload()
        fx_patch, factor_patch = self.factor_patches()

        with fx_patch, factor_patch:
            first = self.client.post("/calculate", json=payload)
            payload["naics"]["raw_material"] = "331315"
            second = self.client.post("/calculate", json=payload)

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.json()["calculation"]["factors"]["raw_material"], 0.25)
        self.assertEqual(second.json()["calculation"]["factors"]["raw_material"], 1.25)
        self.assertEqual(first.json()["emissions"]["raw_material"], 15.0)
        self.assertEqual(second.json()["emissions"]["raw_material"], 75.0)

    def test_line_item_naics_codes_control_item_and_category_results(self):
        payload = calculation_payload()
        payload["line_items"] = [
            {
                "category": "raw_material",
                "amount_sgd": 40.0,
                "naics_code": "331110",
            },
            {
                "category": "raw_material",
                "amount_sgd": 20.0,
                "naics_code": "331315",
            },
            {
                "category": "fabrication",
                "amount_sgd": 25.0,
                "naics_code": "332710",
            },
            {
                "category": "surface_treatment",
                "amount_sgd": 15.0,
                "naics_code": "332813",
            },
        ]
        fx_patch, factor_patch = self.factor_patches()

        with fx_patch, factor_patch:
            response = self.client.post("/calculate", json=payload)

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(
            [item["factor"] for item in body["calculation"]["line_items"]],
            [0.25, 1.25, 0.50, 1.50],
        )
        self.assertEqual(body["emissions"]["raw_material"], 35.0)
        self.assertEqual(body["calculation"]["factors"]["raw_material"], 35.0 / 60.0)
        self.assertEqual(body["emissions"]["total"], 70.0)

    def test_rejects_years_without_shipped_fx_and_inflation_data(self):
        payload = calculation_payload()
        payload["year"] = 2030

        with patch.object(
            main,
            "compute_emissions",
            return_value=calculation_result(payload["year"]),
        ) as calculate:
            response = self.client.post("/calculate", json=payload)

        self.assertEqual(response.status_code, 422)
        self.assertIn("less than or equal to 2026", response.text)
        calculate.assert_not_called()

    def test_method2_rejects_years_without_shipped_fx_and_inflation_data(self):
        payload = {
            "part_id": "METHOD2-YEAR-TEST",
            "year": 2021,
            "raw_material_sgd": 100.0,
            "surface_treatment_sgd": 50.0,
            "naics": {
                "raw_material": "331110",
                "fabrication": "332710",
                "surface_treatment": "332812",
            },
            "transport_emissions_kg": 0.0,
            "machining_entries": [],
        }

        with patch.object(main, "compute_method2") as calculate:
            response = self.client.post("/method2/calculate", json=payload)

        self.assertEqual(response.status_code, 422)
        self.assertIn("greater than or equal to 2022", response.text)
        calculate.assert_not_called()


if __name__ == "__main__":
    unittest.main()
