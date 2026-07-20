import pandas as pd

from calculation.engine import USEEIO_FACTORS, compute_component_emission


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
    raw_df[["usd", "usd_2022", "metal_emission"]] = raw_df.apply(
        lambda x: pd.Series(compute_component_emission(
            x.cost_sgd, x.year, USEEIO_FACTORS["metal"]
        )),
        axis=1,
    )

    # SURFACE
    surface_df[["usd", "usd_2022", "surface_emission"]] = surface_df.apply(
        lambda x: pd.Series(compute_component_emission(
            x.cost_sgd, x.year, USEEIO_FACTORS["surface"]
        )),
        axis=1,
    )

    # MACHINING
    machining_df[["usd", "usd_2022", "machining_emission"]] = machining_df.apply(
        lambda x: pd.Series(compute_component_emission(
            x.machining_cost_sgd, x.invoice_year, USEEIO_FACTORS["machining"]
        )),
        axis=1,
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
