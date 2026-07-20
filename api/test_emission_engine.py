from __future__ import annotations

import unittest

from calculation.engine import (
    calculate_machine_emission,
    calculate_spend_emissions,
    calculate_transport_emission,
)


class EmissionEngineTests(unittest.TestCase):
    def test_category_spend_calculation_uses_one_currency_pipeline(self):
        result = calculate_spend_emissions(
            year=2024,
            amounts_sgd={
                "raw_material": 100.0,
                "fabrication": 50.0,
                "surface_treatment": 25.0,
            },
            factors={
                "raw_material": 2.0,
                "fabrication": 1.0,
                "surface_treatment": 0.5,
            },
            fx_rate=0.5,
            inflation_index=100.0,
            base_inflation_index=100.0,
        )

        self.assertEqual(result["calculation"]["usd2022_amounts"]["raw_material"], 50.0)
        self.assertEqual(result["emissions"]["raw_material"], 100.0)
        self.assertEqual(result["emissions"]["total"], 131.25)

    def test_line_items_reconcile_to_category_and_total_emissions(self):
        result = calculate_spend_emissions(
            year=2024,
            amounts_sgd={},
            factors={},
            fx_rate=1.0,
            inflation_index=100.0,
            base_inflation_index=100.0,
            line_items=[
                {"category": "raw_material", "amount_sgd": 40, "naics_code": "331110", "factor": 0.25},
                {"category": "raw_material", "amount_sgd": 60, "naics_code": "331315", "factor": 1.25},
            ],
        )

        self.assertEqual(result["emissions"]["raw_material"], 85.0)
        self.assertEqual(result["emissions"]["total"], 85.0)
        self.assertEqual(result["calculation"]["factors"]["raw_material"], 0.85)

    def test_transport_and_machine_formulas_use_activity_units(self):
        self.assertEqual(calculate_transport_emission(1_000, 500, 0.02), 10.0)
        self.assertEqual(calculate_machine_emission(5, 3, 0.4), 6.0)


if __name__ == "__main__":
    unittest.main()
