from __future__ import annotations

import argparse
from pathlib import Path
import sys

import pandas as pd

sys.path.append(str(Path(__file__).resolve().parent / "api"))

DEFAULT_SUPPLY_CHAIN_CSV = (
    Path(__file__).resolve().parent
    / "DB"
    / "SupplyChainGHGEmissionFactors_v1.3.0_NAICS_CO2e_USD2022.csv"
)
DEFAULT_SUPPLY_CHAIN_FACTOR_COLUMN = "Supply Chain Emission Factors with Margins"


UPSERT_SQL = """
INSERT INTO official_naics_factors
    (naics_code, description, kgco2e_per_usd, data_source)
VALUES
    (%s, %s, %s, %s)
ON DUPLICATE KEY UPDATE
    description = VALUES(description),
    kgco2e_per_usd = VALUES(kgco2e_per_usd),
    data_source = VALUES(data_source)
"""


def find_ghg_indicator_id(indicators: pd.DataFrame) -> str:
    normalized = indicators.fillna("").astype(str)
    matches = normalized[
        normalized["SimpleName"].str.casefold().eq("greenhouse gases")
        | normalized["Code"].str.casefold().eq("ghg")
        | normalized["Name"].str.casefold().eq("climate change")
    ]

    if matches.empty:
        raise ValueError("Could not find the Greenhouse Gases indicator row.")

    return str(matches.iloc[0]["ID"])


def extract_ghg_row(n_matrix: pd.DataFrame, ghg_indicator_id: str) -> pd.Series:
    id_column_name = n_matrix.columns[0]
    cleaned_ids = n_matrix.iloc[:, 0].astype(str).str.casefold().str.strip()
    cleaned_target = str(ghg_indicator_id).casefold().strip()
    candidate_targets = [cleaned_target]

    if "ghg" in cleaned_target:
        candidate_targets.extend([
            "greenhouse gases",
            "greenhouse gas",
            "climate change",
            "carbon dioxide",
            "co2",
            "ghg",
        ])

    matched = n_matrix[cleaned_ids.isin(candidate_targets)]
    if matched.empty:
        matched = n_matrix[
            cleaned_ids.str.contains(
                r"ghg|greenhouse|climate|carbon dioxide|co2",
                regex=True,
                na=False,
            )
        ]

    if matched.empty:
        raise ValueError(f"The N sheet does not contain indicator ID {ghg_indicator_id}.")

    return pd.to_numeric(
        matched.iloc[0].drop(labels=[id_column_name]),
        errors="coerce",
    )


def build_useeio_workbook_rows(workbook_path: Path, data_source: str) -> list[tuple[str, str, float, str]]:
    indicators = pd.read_excel(workbook_path, sheet_name="indicators")
    commodities = pd.read_excel(workbook_path, sheet_name="commodities_meta")
    n_matrix = pd.read_excel(workbook_path, sheet_name="N")

    ghg_indicator_id = find_ghg_indicator_id(indicators)
    ghg_factors = extract_ghg_row(n_matrix, ghg_indicator_id)

    factors = (
        ghg_factors.rename("kgco2e_per_usd")
        .rename_axis("ID")
        .reset_index()
    )
    factors["ID"] = factors["ID"].astype(str)

    merged = commodities.merge(factors, on="ID", how="inner")
    merged["naics_code"] = merged["Code"].astype(str).str.split("/", n=1).str[0]
    merged["description"] = merged["Name"].astype(str).str.strip()
    merged["kgco2e_per_usd"] = pd.to_numeric(
        merged["kgco2e_per_usd"],
        errors="coerce",
    )

    cleaned = merged.dropna(subset=["naics_code", "description", "kgco2e_per_usd"])
    cleaned = cleaned[cleaned["naics_code"].str.fullmatch(r"\d{6}")]

    return [
        (
            row.naics_code,
            row.description,
            float(row.kgco2e_per_usd),
            data_source,
        )
        for row in cleaned.itertuples(index=False)
    ]


def build_supply_chain_csv_rows(
    csv_path: Path,
    data_source: str,
    factor_column: str,
) -> list[tuple[str, str, float, str]]:
    factors = pd.read_csv(csv_path, dtype={"2017 NAICS Code": str})
    required_columns = {
        "2017 NAICS Code",
        "2017 NAICS Title",
        factor_column,
    }
    missing_columns = sorted(required_columns - set(factors.columns))
    if missing_columns:
        raise ValueError(f"Supply chain CSV is missing column(s): {', '.join(missing_columns)}")

    if "GHG" in factors.columns:
        factors = factors[factors["GHG"].astype(str).str.casefold().eq("all ghgs")]

    factors["naics_code"] = (
        factors["2017 NAICS Code"]
        .astype(str)
        .str.extract(r"(\d{6})", expand=False)
    )
    factors["description"] = factors["2017 NAICS Title"].astype(str).str.strip()
    factors["kgco2e_per_usd"] = pd.to_numeric(factors[factor_column], errors="coerce")

    cleaned = factors.dropna(subset=["naics_code", "description", "kgco2e_per_usd"])
    cleaned = cleaned[cleaned["naics_code"].str.fullmatch(r"\d{6}")]

    return [
        (
            row.naics_code,
            row.description,
            float(row.kgco2e_per_usd),
            data_source,
        )
        for row in cleaned.itertuples(index=False)
    ]


def build_seed_rows(
    input_path: Path,
    data_source: str,
    source_format: str,
    factor_column: str,
) -> list[tuple[str, str, float, str]]:
    if source_format == "auto":
        source_format = "supplychain-csv" if input_path.suffix.casefold() == ".csv" else "useeio-workbook"

    if source_format == "supplychain-csv":
        return build_supply_chain_csv_rows(input_path, data_source, factor_column)

    if source_format == "useeio-workbook":
        return build_useeio_workbook_rows(input_path, data_source)

    raise ValueError(f"Unsupported source format: {source_format}")


def seed_database(
    rows: list[tuple[str, str, float, str]],
    batch_size: int,
    truncate: bool,
) -> int:
    import mysql.connector
    from db import get_conn

    conn = get_conn()
    try:
        cursor = conn.cursor()
        try:
            if truncate:
                cursor.execute("DELETE FROM user_custom_dictionary")
                cursor.execute("DELETE FROM official_naics_factors")

            for start in range(0, len(rows), batch_size):
                cursor.executemany(UPSERT_SQL, rows[start : start + batch_size])

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
        description="Seed TiDB official_naics_factors from EPA supply chain or USEEIO source data.",
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_SUPPLY_CHAIN_CSV,
        help="Source file to import. Defaults to the EPA Supply Chain GHG NAICS CSV.",
    )
    parser.add_argument(
        "--workbook",
        type=Path,
        default=None,
        help="Legacy alias for importing a USEEIO workbook.",
    )
    parser.add_argument(
        "--source-format",
        choices=["auto", "supplychain-csv", "useeio-workbook"],
        default="auto",
        help="How to parse the source file.",
    )
    parser.add_argument(
        "--factor-column",
        default=DEFAULT_SUPPLY_CHAIN_FACTOR_COLUMN,
        help="Supply chain CSV factor column to store as kgco2e_per_usd.",
    )
    parser.add_argument(
        "--data-source",
        default="EPA Supply Chain GHG Emission Factors v1.3.0",
        help="Value to store in official_naics_factors.data_source.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=500,
        help="Number of rows inserted per database batch.",
    )
    parser.add_argument(
        "--truncate",
        action="store_true",
        help="Clear existing official factors and custom dictionary rows before seeding.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse CSVs and print the row count without inserting into TiDB.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    input_path = args.workbook or args.input
    source_format = "useeio-workbook" if args.workbook else args.source_format
    rows = build_seed_rows(
        input_path=input_path,
        data_source=args.data_source,
        source_format=source_format,
        factor_column=args.factor_column,
    )

    if args.dry_run:
        print(f"Prepared {len(rows)} official NAICS factor rows from {input_path}.")
        return

    inserted = seed_database(rows, args.batch_size, args.truncate)
    print(f"Seeded {inserted} official NAICS factor rows into TiDB.")


if __name__ == "__main__":
    main()
