import pandas as pd

# ------------------------------
# 1. Reference Tables
# ------------------------------

FX_TABLE = {
    2023: 0.75,
    2024: 0.74,
    2025: 0.73,
}

GDP_DEFLATOR = {
    2022: 100.0,
    2023: 103.2,
    2024: 106.5,
    2025: 109.0,
}

USEEIO_FACTORS = {
    "metal": 0.85,       # placeholder: kg CO2 / USD
    "machining": 0.45,
    "surface": 1.20,
}

# ------------------------------
# 2. Helper functions
# ------------------------------


def convert_sgd_to_usd(amount_sgd: float, year: int) -> float:
    rate = FX_TABLE.get(year)
    if rate is None:
        raise ValueError(f"No FX rate for year {year}")
    return amount_sgd * rate


def convert_to_2022_usd(amount_usd: float, year: int) -> float:
    gdp_year = GDP_DEFLATOR.get(year)
    gdp_2022 = GDP_DEFLATOR[2022]
    if gdp_year is None:
        raise ValueError(f"No GDP deflator for year {year}")
    return amount_usd * (gdp_2022 / gdp_year)


# ------------------------------
# 3. Load data from Excel
# ------------------------------


def load_data():
    # These filenames MUST exist in the same folder as main.py
    raw_file = "raw_and_surface.xlsx"
    machining_file = "machining_fake.xlsx"

    # Sheet 1: raw material
    raw_df = pd.read_excel(
        raw_file,
        sheet_name="raw_material",
        dtype={"part_id": str, "year": int, "cost_sgd": float},
    )

    # Sheet 2: surface treatment
    surface_df = pd.read_excel(
        raw_file,
        sheet_name="surface_treatment",
        dtype={"part_id": str, "year": int, "cost_sgd": float},
    )

    # Machining fake data
    machining_df = pd.read_excel(
        machining_file,
        sheet_name=0,  # first sheet
        dtype={
            "part_id": str,
            "invoice_year": int,
            "invoice_month": int,
            "process_type": str,
            "machining_cost_sgd": float,
            "naics_code": int,
        },
    )

    return raw_df, surface_df, machining_df


# ------------------------------
# 4. Main emission calculation
# ------------------------------


def process_emissions():
    raw_df, surface_df, machining_df = load_data()

    # METAL
    raw_df["usd"] = raw_df.apply(
        lambda x: convert_sgd_to_usd(x.cost_sgd, x.year), axis=1
    )
    raw_df["usd_2022"] = raw_df.apply(
        lambda x: convert_to_2022_usd(x.usd, x.year), axis=1
    )
    raw_df["metal_emission"] = raw_df["usd_2022"] * USEEIO_FACTORS["metal"]

    # SURFACE
    surface_df["usd"] = surface_df.apply(
        lambda x: convert_sgd_to_usd(x.cost_sgd, x.year), axis=1
    )
    surface_df["usd_2022"] = surface_df.apply(
        lambda x: convert_to_2022_usd(x.usd, x.year), axis=1
    )
    surface_df["surface_emission"] = (
        surface_df["usd_2022"] * USEEIO_FACTORS["surface"]
    )

    # MACHINING
    machining_df["usd"] = machining_df.apply(
        lambda x: convert_sgd_to_usd(x.machining_cost_sgd, x.invoice_year),
        axis=1,
    )
    machining_df["usd_2022"] = machining_df.apply(
        lambda x: convert_to_2022_usd(x.usd, x.invoice_year), axis=1
    )
    machining_df["machining_emission"] = (
        machining_df["usd_2022"] * USEEIO_FACTORS["machining"]
    )

    # MERGE per part_id
    df = raw_df[["part_id", "metal_emission"]]
    df = df.merge(
        machining_df[["part_id", "machining_emission"]],
        on="part_id",
        how="left",
    )
    df = df.merge(
        surface_df[["part_id", "surface_emission"]],
        on="part_id",
        how="left",
    )

    df = df.fillna(0)

    # TOTAL
    df["total_emission"] = (
        df["metal_emission"]
        + df["machining_emission"]
        + df["surface_emission"]
    )

    return df


# ------------------------------
# 5. Run script
# ------------------------------

if __name__ == "__main__":
    result = process_emissions()
    print(result)
    result.to_excel("final_emission_output.xlsx", index=False)