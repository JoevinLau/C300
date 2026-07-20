from __future__ import annotations

from collections.abc import Callable, Sequence
import logging
from typing import Any

import mysql.connector
from mysql.connector import Error as MySQLError

try:
    from db import get_conn, read_with_retry
except ModuleNotFoundError:
    from api.db import get_conn, read_with_retry

logger = logging.getLogger(__name__)


class ReferenceDataRepository:
    """Single read boundary for versioned calculation reference tables."""

    def __init__(
        self,
        connection_factory: Callable[[], mysql.connector.MySQLConnection] = get_conn,
    ) -> None:
        self._connection_factory = connection_factory

    def _read(self, operation_name: str, reader: Callable[[Any], Any]) -> Any:
        return read_with_retry(
            operation_name,
            reader,
            connection_factory=self._connection_factory,
        )

    def fx_and_inflation(self, year: int) -> tuple[dict | None, dict | None]:
        def read(cur: Any) -> tuple[dict | None, dict | None]:
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
            return fx_row, cur.fetchone()

        return self._read("FX and inflation reference query", read)

    def naics_factor(self, naics_code: str) -> dict | None:
        def read(cur: Any) -> dict | None:
            return self.naics_factor_from_cursor(cur, naics_code)

        return self._read("NAICS factor reference query", read)

    def naics_factor_from_cursor(self, cur: Any, naics_code: str) -> dict | None:
        cur.execute(
            """
            SELECT naics_code, description, category, kgco2e_per_usd, data_source
            FROM official_naics_factors
            WHERE naics_code = %s
            LIMIT 1
            """,
            (naics_code,),
        )
        return cur.fetchone()

    def exact_naics_factor_from_cursor(self, cur: Any, token: str) -> dict | None:
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
        return cur.fetchone()

    def search_naics_factors_from_cursor(self, cur: Any, token: str) -> list[dict]:
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
            logger.warning(
                "Official NAICS fulltext search failed; falling back to LIKE. token=%r error=%s",
                token,
                exc,
            )
            search_terms = [part for part in token.split() if len(part) >= 2] or [token]
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
        return cur.fetchall() or []

    def naics_factors(self, naics_codes: Sequence[str]) -> list[dict]:
        if not naics_codes:
            return []

        def read(cur: Any) -> list[dict]:
            placeholders = ", ".join(["%s"] * len(naics_codes))
            cur.execute(
                f"""
                SELECT naics_code, description, category, kgco2e_per_usd, data_source
                FROM official_naics_factors
                WHERE naics_code IN ({placeholders})
                """,
                tuple(naics_codes),
            )
            return cur.fetchall() or []

        return self._read("NAICS factor batch reference query", read)

    def list_naics_factors(self, category: str | None = None) -> list[dict]:
        def read(cur: Any) -> list[dict]:
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
            return cur.fetchall() or []

        return self._read("NAICS factor list reference query", read)

    def transport_factor(self, transport_modes: Sequence[str]) -> dict | None:
        if not transport_modes:
            return None

        def read(cur: Any) -> dict | None:
            placeholders = ", ".join(["%s"] * len(transport_modes))
            cur.execute(
                f"""
                SELECT transport_mode, kgco2e_per_tonne_km, data_source
                FROM method2_transport_emission_factors
                WHERE transport_mode IN ({placeholders})
                ORDER BY valid_from DESC, id DESC
                LIMIT 1
                """,
                tuple(transport_modes),
            )
            return cur.fetchone()

        return self._read("transport factor reference query", read)

    def machine_references(self, country_code: str) -> tuple[dict | None, list[dict]]:
        def read(cur: Any) -> tuple[dict | None, list[dict]]:
            cur.execute(
                """
                SELECT country_code, year, kgco2e_per_kwh, data_source
                FROM method2_grid_electricity_factors
                WHERE country_code = %s
                ORDER BY year DESC, id DESC
                LIMIT 1
                """,
                (country_code,),
            )
            grid_factor = cur.fetchone()
            cur.execute(
                """
                SELECT machine_name, duty_level, avg_operating_load_kw, country_code, data_source
                FROM method2_machine_profiles
                WHERE country_code = %s
                ORDER BY machine_name, duty_level
                """,
                (country_code,),
            )
            return grid_factor, cur.fetchall() or []

        return self._read("machine and grid reference query", read)


DEFAULT_REFERENCE_DATA = ReferenceDataRepository()
