from __future__ import annotations

import sys
import unittest
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from sync_singstat_price_indices import parse_manufactured_goods


class SingStatSyncTests(unittest.TestCase):
    def test_extracts_only_the_manufactured_goods_monthly_series(self):
        payload = {
            "StatusCode": 200,
            "Data": {
                "title": "Import Price Index, Base Year 2023 = 100, Monthly",
                "datasource": "SINGAPORE DEPARTMENT OF STATISTICS",
                "dataLastUpdated": "29/06/2026",
                "row": [
                    {
                        "rowText": "Machinery & Transport Equipment",
                        "columns": [{"key": "2026 May", "value": "102.1"}],
                    },
                    {
                        "rowText": "   Manufactured Goods",
                        "columns": [
                            {"key": "2026 May", "value": "101.088"},
                            {"key": "2026 Apr", "value": "100.500"},
                            {"key": "2025 Dec", "value": "95.250"},
                        ],
                    },
                ],
            },
        }

        rows = parse_manufactured_goods(
            payload,
            index_type="import_manufactured_goods",
            index_label="Import Price Index - Manufactured Goods",
            resource_id="M213241",
        )

        self.assertEqual(len(rows), 3)
        self.assertEqual((rows[0].year, rows[0].month), (2026, 5))
        self.assertAlmostEqual(rows[0].index_value, 101.088)
        self.assertEqual(rows[0].base_year, 2023)
        self.assertTrue(rows[0].is_provisional)
        self.assertFalse(rows[1].is_provisional)

    def test_rejects_a_response_without_the_required_series(self):
        payload = {
            "StatusCode": 200,
            "Data": {
                "title": "Index, Base Year 2023 = 100, Monthly",
                "row": [{"rowText": "Overall Items", "columns": []}],
            },
        }

        with self.assertRaisesRegex(ValueError, "no Manufactured Goods series"):
            parse_manufactured_goods(
                payload,
                index_type="import_manufactured_goods",
                index_label="Import Price Index - Manufactured Goods",
                resource_id="M213241",
            )


if __name__ == "__main__":
    unittest.main()
