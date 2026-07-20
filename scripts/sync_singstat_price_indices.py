from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen
from urllib.parse import urlencode

ROOT_DIR = Path(__file__).resolve().parents[1]
API_DIR = ROOT_DIR / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

API_TEMPLATE = "https://tablebuilder.singstat.gov.sg/api/table/tabledata/{resource_id}"
SERIES = {
    "import_manufactured_goods": {
        "resource_id": "M213241",
        "label": "Import Price Index - Manufactured Goods",
    },
    "domestic_supply_manufactured_goods": {
        "resource_id": "M213381",
        "label": "Domestic Supply Price Index - Manufactured Goods",
    },
}


@dataclass(frozen=True)
class PriceIndexRow:
    index_type: str
    index_label: str
    year: int
    month: int
    index_value: float
    base_year: int
    source: str
    resource_id: str
    is_provisional: bool


def fetch_table_data(resource_id: str, timeout: int = 30) -> dict[str, Any]:
    query = urlencode({"search": "Manufactured Goods", "limit": 5000})
    request = Request(
        f"{API_TEMPLATE.format(resource_id=resource_id)}?{query}",
        headers={
            "Accept": "application/json",
            "User-Agent": "C300-CarbonSpend/1.0 (Method 3 SingStat sync)",
        },
    )
    with urlopen(request, timeout=timeout) as response:
        payload = json.load(response)
    if int(payload.get("StatusCode", 0)) != 200:
        raise RuntimeError(
            f"SingStat {resource_id} returned {payload.get('StatusCode')}: "
            f"{payload.get('Message', 'Unknown error')}"
        )
    return payload


def _parse_period(value: str) -> tuple[int, int]:
    cleaned = value.strip()
    try:
        parsed = datetime.strptime(cleaned, "%Y %b")
    except ValueError as exc:
        raise ValueError(f"Unsupported SingStat monthly period: {value!r}") from exc
    return parsed.year, parsed.month


def parse_manufactured_goods(
    payload: dict[str, Any],
    *,
    index_type: str,
    index_label: str,
    resource_id: str,
) -> list[PriceIndexRow]:
    data = payload.get("Data")
    if not isinstance(data, dict):
        raise ValueError(f"SingStat {resource_id} response has no Data object.")
    title = str(data.get("title") or "")
    base_match = re.search(r"Base Year\s+(\d{4})\s*=\s*100", title, re.IGNORECASE)
    if not base_match:
        raise ValueError(f"Could not identify the base year from SingStat title: {title!r}")
    base_year = int(base_match.group(1))

    rows = data.get("row")
    if not isinstance(rows, list):
        raise ValueError(f"SingStat {resource_id} response has no row list.")
    manufactured = next(
        (
            row
            for row in rows
            if isinstance(row, dict)
            and str(row.get("rowText") or "").strip().casefold() == "manufactured goods"
        ),
        None,
    )
    if not manufactured:
        raise ValueError(f"SingStat {resource_id} has no Manufactured Goods series.")

    columns = manufactured.get("columns")
    if not isinstance(columns, list):
        raise ValueError(f"SingStat {resource_id} Manufactured Goods series has no columns.")
    source = str(data.get("datasource") or "Singapore Department of Statistics").strip()
    data_last_updated = str(data.get("dataLastUpdated") or "")
    result: list[PriceIndexRow] = []
    for column in columns:
        if not isinstance(column, dict):
            continue
        raw_value = str(column.get("value") or "").replace(",", "").strip()
        if not raw_value or raw_value.casefold() in {"na", "-", "nil"}:
            continue
        year, month = _parse_period(str(column.get("key") or ""))
        result.append(
            PriceIndexRow(
                index_type=index_type,
                index_label=index_label,
                year=year,
                month=month,
                index_value=float(raw_value),
                base_year=base_year,
                source=f"{source}; SingStat {resource_id}",
                resource_id=resource_id,
                is_provisional=(
                    bool(data_last_updated)
                    and (year, month) == max(
                        (_parse_period(str(item.get("key") or "")) for item in columns if isinstance(item, dict)),
                        default=(year, month),
                    )
                ),
            )
        )
    if not result:
        raise ValueError(f"SingStat {resource_id} returned no numeric monthly values.")
    return result


def sync_database(rows: list[PriceIndexRow]) -> int:
    import mysql.connector
    from db import get_conn

    conn = get_conn()
    try:
        cursor = conn.cursor()
        try:
            cursor.executemany(
                """
                INSERT INTO singapore_price_indices
                    (index_type, index_label, year, month, index_value, base_year,
                     source, resource_id, retrieved_at, is_provisional)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    index_label = VALUES(index_label),
                    index_value = VALUES(index_value),
                    base_year = VALUES(base_year),
                    source = VALUES(source),
                    resource_id = VALUES(resource_id),
                    retrieved_at = VALUES(retrieved_at),
                    is_provisional = VALUES(is_provisional)
                """,
                [
                    (
                        row.index_type,
                        row.index_label,
                        row.year,
                        row.month,
                        row.index_value,
                        row.base_year,
                        row.source,
                        row.resource_id,
                        datetime.now(timezone.utc).replace(tzinfo=None),
                        row.is_provisional,
                    )
                    for row in rows
                ],
            )
            conn.commit()
            return len(rows)
        except mysql.connector.Error:
            conn.rollback()
            raise
        finally:
            cursor.close()
    finally:
        conn.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Sync Method 3 manufactured-goods monthly indices from SingStat."
    )
    parser.add_argument(
        "--fixture-dir",
        type=Path,
        help="Read <resource-id>.json files instead of calling SingStat (useful for testing).",
    )
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    rows: list[PriceIndexRow] = []
    for index_type, config in SERIES.items():
        resource_id = config["resource_id"]
        if args.fixture_dir:
            with (args.fixture_dir / f"{resource_id}.json").open(encoding="utf-8") as source:
                payload = json.load(source)
        else:
            payload = fetch_table_data(resource_id)
        parsed = parse_manufactured_goods(
            payload,
            index_type=index_type,
            index_label=config["label"],
            resource_id=resource_id,
        )
        rows.extend(parsed)
        newest = max(parsed, key=lambda item: (item.year, item.month))
        print(
            f"{config['label']}: {len(parsed)} months; newest "
            f"{newest.year}-{newest.month:02d} = {newest.index_value}."
        )
    if args.dry_run:
        return
    synced = sync_database(rows)
    print(f"Synced {synced} SingStat monthly price-index rows.")


if __name__ == "__main__":
    main()
