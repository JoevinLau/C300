from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from mysql.connector import Error as MySQLError


API_DIR = Path(__file__).resolve().parent
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from repositories.reference_data import ReferenceDataRepository
from services.transport import calculate_local_transport_estimate


class FakeCursor:
    def __init__(self, responses: list[object], failure: BaseException | None = None) -> None:
        self.responses = list(responses)
        self.failure = failure
        self.executions: list[tuple[str, tuple[object, ...]]] = []
        self.closed = False

    def execute(self, sql: str, params: tuple[object, ...]) -> None:
        self.executions.append((sql, params))
        if self.failure:
            failure, self.failure = self.failure, None
            raise failure

    def fetchone(self):
        return self.responses.pop(0)

    def fetchall(self):
        return self.responses.pop(0)

    def close(self) -> None:
        self.closed = True


class FakeConnection:
    def __init__(self, cursor: FakeCursor) -> None:
        self.fake_cursor = cursor
        self.closed = False

    def cursor(self, dictionary: bool = True) -> FakeCursor:
        if not dictionary:
            raise AssertionError("Reference reads must use dictionary cursors")
        return self.fake_cursor

    def close(self) -> None:
        self.closed = True


class ReferenceDataRepositoryTests(unittest.TestCase):
    def test_authoritative_reference_queries_stay_in_the_repository(self):
        table_names = {
            "exchange_rates",
            "inflation_indices",
            "official_naics_factors",
            "method2_grid_electricity_factors",
            "method2_machine_profiles",
            "method2_transport_emission_factors",
        }
        repository_path = API_DIR / "repositories" / "reference_data.py"
        source_roots = (API_DIR, API_DIR.parent / "calculation")
        violations: list[str] = []

        for source_root in source_roots:
            for path in source_root.rglob("*.py"):
                if path == repository_path or "venv" in path.parts or path.name.startswith("test_"):
                    continue
                source = path.read_text(encoding="utf-8")
                for table_name in table_names:
                    if f"FROM {table_name}" in source:
                        violations.append(f"{path.relative_to(API_DIR.parent)} reads {table_name}")

        self.assertEqual(violations, [])

    def test_fx_and_inflation_share_one_read_snapshot(self):
        cursor = FakeCursor([{"rate_to_usd": 0.75}, {"index_value": 123.4}])
        connection = FakeConnection(cursor)
        calls = 0

        def connection_factory() -> FakeConnection:
            nonlocal calls
            calls += 1
            return connection

        repository = ReferenceDataRepository(connection_factory=connection_factory)
        fx_row, inflation_row = repository.fx_and_inflation(2024)

        self.assertEqual(calls, 1)
        self.assertEqual(fx_row, {"rate_to_usd": 0.75})
        self.assertEqual(inflation_row, {"index_value": 123.4})
        self.assertEqual(len(cursor.executions), 2)
        self.assertTrue(cursor.closed)
        self.assertTrue(connection.closed)

    def test_transient_read_failure_retries_the_whole_operation(self):
        failed_cursor = FakeCursor([], MySQLError(msg="connection lost", errno=2013))
        successful_cursor = FakeCursor([{"naics_code": "331110", "kgco2e_per_usd": 0.25}])
        connections = [FakeConnection(failed_cursor), FakeConnection(successful_cursor)]

        repository = ReferenceDataRepository(connection_factory=lambda: connections.pop(0))
        with patch.dict(
            os.environ,
            {"DB_CONNECT_RETRIES": "2", "DB_RETRY_DELAY_SECONDS": "0"},
        ):
            factor = repository.naics_factor("331110")

        self.assertEqual(factor["kgco2e_per_usd"], 0.25)
        self.assertTrue(failed_cursor.closed)
        self.assertTrue(successful_cursor.closed)

    def test_machine_and_grid_rows_share_one_read_snapshot(self):
        cursor = FakeCursor([
            {"country_code": "SG", "year": 2025, "kgco2e_per_kwh": 0.4, "data_source": "grid"},
            [{"machine_name": "Lathe", "duty_level": "Medium"}],
        ])
        connection = FakeConnection(cursor)
        repository = ReferenceDataRepository(connection_factory=lambda: connection)

        grid, machines = repository.machine_references("SG")

        self.assertEqual(grid["year"], 2025)
        self.assertEqual(machines[0]["machine_name"], "Lathe")
        self.assertEqual(len(cursor.executions), 2)
        self.assertTrue(connection.closed)

    def test_local_estimate_reports_database_factor_source(self):
        class Repository:
            def transport_factor(self, modes):
                self.modes = modes
                return {
                    "kgco2e_per_tonne_km": 0.02,
                    "data_source": "authoritative transport table",
                }

        repository = Repository()
        result = calculate_local_transport_estimate(
            "Shanghai",
            "Singapore",
            1_000,
            "sea",
            "China",
            repository=repository,
        )

        self.assertEqual(repository.modes, ("sea", "vessel", "ship"))
        self.assertEqual(result["transport"]["chosen_emissions_kg"], 72.0)
        self.assertIn("authoritative transport table", result["transport"]["source"])


if __name__ == "__main__":
    unittest.main()
