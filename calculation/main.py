import pandas as pd

try:
    from calculation.engine import (
        FX_TABLE,
        GDP_DEFLATOR,
        USEEIO_FACTORS,
        calculate_transport_emission,
        compute_component_emission,
        compute_from_sgd_amounts,
        convert_sgd_to_usd,
        convert_to_2022_usd,
    )
except ModuleNotFoundError:
    from engine import (
        FX_TABLE,
        GDP_DEFLATOR,
        USEEIO_FACTORS,
        calculate_transport_emission,
        compute_component_emission,
        compute_from_sgd_amounts,
        convert_sgd_to_usd,
        convert_to_2022_usd,
    )

try:
    from calculation.transport_data import (
        DISTANCES_TO_SINGAPORE_KM,
        EMISSION_FACTORS_KG_PER_TKM,
        DEFAULT_WEIGHT_KG,
    )
except ModuleNotFoundError:
    from transport_data import (
        DISTANCES_TO_SINGAPORE_KM,
        EMISSION_FACTORS_KG_PER_TKM,
        DEFAULT_WEIGHT_KG,
    )


# ------------------------------
# 3. Load data from Excel
# ------------------------------


def load_data():
    # These filenames MUST exist in the same folder as main.py
    raw_file = "raw_material.xlsx"
    surface_file = "treatment_cost.xlsx"
    machining_file = "fake_machining_cost.xlsx"

    # Raw material - skip title rows (rows 0-1), use row 2 as header
    raw_df = pd.read_excel(
        raw_file,
        sheet_name=0,
        header=2  # Row 3 in Excel (0-indexed: row 2)
    )
    # Create consistent columns: part_id, year, cost_sgd
    raw_df["part_id"] = raw_df["SUPPLIER"].astype(str)  # Use Supplier name
    raw_df["year"] = 2026  # Year from file title
    raw_df["cost_sgd"] = pd.to_numeric(raw_df["Total"], errors='coerce')  # Total cost
    raw_df = raw_df[["part_id", "year", "cost_sgd"]].dropna()

    # Surface treatment - read as-is (monthly aggregated data)
    # Since this file has aggregated costs, create a minimal entry
    surface_df = pd.DataFrame({
        "part_id": ["surface_treatment"],
        "year": [2023],
        "cost_sgd": [5508.0]  # Example: AT treatment cost
    })

    # Machining data - already well-structured
    machining_df = pd.read_excel(
        machining_file,
        sheet_name=0,
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
# 5. Interactive Calculator
# ------------------------------

def load_raw_materials():
    """Load raw material data and return as DataFrame"""
    raw_file = "raw_material.xlsx"
    raw_df = pd.read_excel(raw_file, sheet_name=0, header=2)
    raw_df["part_id"] = raw_df["SUPPLIER"].astype(str)
    raw_df["year"] = 2026
    raw_df["cost_sgd"] = pd.to_numeric(raw_df["Total"], errors='coerce')
    return raw_df[["part_id", "year", "cost_sgd"]].dropna()


def load_machining_data():
    """Load machining data"""
    machining_file = "fake_machining_cost.xlsx"
    machining_df = pd.read_excel(
        machining_file,
        sheet_name=0,
        dtype={
            "part_id": str,
            "invoice_year": int,
            "invoice_month": int,
            "process_type": str,
            "machining_cost_sgd": float,
            "naics_code": int,
        },
    )
    return machining_df


def load_surface_data():
    """Load surface treatment data"""
    surface_df = pd.DataFrame({
        "part_id": ["surface_treatment"],
        "year": [2023],
        "cost_sgd": [5508.0]
    })
    return surface_df


def browse_and_select_parts():
    """Browse available raw materials and let user select one"""
    raw_materials = load_raw_materials()
    
    print("\n" + "="*70)
    print("AVAILABLE RAW MATERIALS")
    print("="*70)
    
    # Get unique suppliers
    suppliers = raw_materials["part_id"].unique()
    suppliers_list = list(suppliers)
    
    # Display available options
    for i, supplier in enumerate(suppliers_list, 1):
        supplier_data = raw_materials[raw_materials["part_id"] == supplier]
        cost = supplier_data["cost_sgd"].values[0]
        print(f"{i:3d}. {supplier:40s} - SGD {cost:>12,.2f}")
    
    print("\n" + "-"*70)
    
    # Get user selection
    while True:
        try:
            selection = int(input(f"Enter supplier number (1-{len(suppliers_list)}) or 0 for all: "))
            if selection == 0:
                selected_suppliers = suppliers_list
                break
            elif 1 <= selection <= len(suppliers_list):
                selected_suppliers = [suppliers_list[selection - 1]]
                break
            else:
                print(f"❌ Invalid selection. Please enter 1-{len(suppliers_list)} or 0.")
        except ValueError:
            print("❌ Please enter a valid number.")
    
    # Return selected data
    selected_data = raw_materials[raw_materials["part_id"].isin(selected_suppliers)]
    return selected_data


def calculate_emissions_from_selection(raw_df_selected):
    """Calculate emissions for selected raw materials"""
    
    # Load all data
    machining_df = load_machining_data()
    surface_df = load_surface_data()
    raw_df = raw_df_selected.copy()
    
    # METAL - Convert and calculate
    raw_df[["usd", "usd_2022", "metal_emission"]] = raw_df.apply(
        lambda x: pd.Series(compute_component_emission(
            x.cost_sgd, x.year, USEEIO_FACTORS["metal"]
        )),
        axis=1,
    )
    
    # SURFACE - Convert and calculate
    surface_df[["usd", "usd_2022", "surface_emission"]] = surface_df.apply(
        lambda x: pd.Series(compute_component_emission(
            x.cost_sgd, x.year, USEEIO_FACTORS["surface"]
        )),
        axis=1,
    )
    
    # MACHINING - Convert and calculate
    machining_df[["usd", "usd_2022", "machining_emission"]] = machining_df.apply(
        lambda x: pd.Series(compute_component_emission(
            x.machining_cost_sgd, x.invoice_year, USEEIO_FACTORS["machining"]
        )),
        axis=1,
    )
    
    # MERGE per part_id
    df = raw_df[["part_id", "cost_sgd", "usd_2022", "metal_emission"]]
    df = df.merge(
        machining_df[["part_id", "machining_cost_sgd", "machining_emission"]],
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


def display_detailed_results(result_df):
    """Display detailed emission calculation results"""
    print("\n" + "="*80)
    print("EMISSION CALCULATION RESULTS")
    print("="*80)
    
    for idx, row in result_df.iterrows():
        print(f"\n📦 PART: {row['part_id']}")
        print("-" * 80)
        
        print(f"\n  INPUT COSTS (SGD):")
        print(f"    Metal/Raw Material:        SGD {row['cost_sgd']:>12,.2f}")
        print(f"    Machining/Fabrication:     SGD {row.get('machining_cost_sgd', 0):>12,.2f}")
        print(f"    Surface Treatment:         SGD {5508.0:>12,.2f} (aggregated)")
        
        print(f"\n  CONVERTED TO 2022 USD:")
        print(f"    Metal:                     USD {row['usd_2022']:>12,.2f}")
        print(f"    Machining:                 USD {row.get('usd_2022', 0):>12,.2f}")
        print(f"    Surface Treatment:         USD (aggregated)")
        
        print(f"\n  CALCULATED EMISSIONS (kg CO2):")
        print(f"    Metal Emissions:           {row['metal_emission']:>15,.2f} kg CO2")
        print(f"    Machining Emissions:       {row['machining_emission']:>15,.2f} kg CO2")
        print(f"    Surface Treatment:         {row['surface_emission']:>15,.2f} kg CO2")
        print(f"    {'-'*50}")
        print(f"    ✓ TOTAL EMISSIONS:         {row['total_emission']:>15,.2f} kg CO2")
    
    print("\n" + "="*80)


def mode1_selective_calculation():
    """Mode 1: Let user choose which components and parts to calculate"""
    print("\n" + "="*70)
    print("MODE 1: CUSTOM CALCULATION - SELECT COMPONENTS & PARTS")
    print("="*70)
    
    # Step 1: Choose which components to calculate
    print("\n" + "-"*70)
    print("STEP 1: SELECT COMPONENTS TO CALCULATE")
    print("-"*70)
    print("\nWhich components do you want to include in the calculation?")
    print("1. Metal/Raw Material (from raw_material.xlsx)")
    print("2. Machining/Fabrication (from fake_machining_cost.xlsx)")
    print("3. Surface Treatment (from treatment_cost.xlsx)")
    print("4. All components (1+2+3)")
    
    component_choice = input("\nSelect components (1-4): ")
    
    components_to_calculate = {}
    if component_choice == "1":
        components_to_calculate = {"metal": True, "machining": False, "surface": False}
    elif component_choice == "2":
        components_to_calculate = {"metal": False, "machining": True, "surface": False}
    elif component_choice == "3":
        components_to_calculate = {"metal": False, "machining": False, "surface": True}
    elif component_choice == "4":
        components_to_calculate = {"metal": True, "machining": True, "surface": True}
    else:
        print("❌ Invalid selection.")
        return
    
    selected_data = {}
    
    # Step 2: Select specific items for each component
    if components_to_calculate["metal"]:
        print("\n" + "-"*70)
        print("STEP 2A: SELECT RAW MATERIALS")
        print("-"*70)
        raw_materials = load_raw_materials()
        suppliers = raw_materials["part_id"].unique()
        suppliers_list = list(suppliers)
        
        print(f"\nAvailable Suppliers ({len(suppliers_list)} total):")
        for i, supplier in enumerate(suppliers_list, 1):
            supplier_data = raw_materials[raw_materials["part_id"] == supplier]
            cost = supplier_data["cost_sgd"].values[0]
            print(f"{i:3d}. {supplier:40s} - SGD {cost:>12,.2f}")
        
        print("\n" + "-"*70)
        while True:
            try:
                selection = int(input(f"Enter supplier number (1-{len(suppliers_list)}) or 0 for all: "))
                if selection == 0:
                    selected_data["metal"] = raw_materials
                    print(f"✓ Selected: All {len(raw_materials)} suppliers")
                    break
                elif 1 <= selection <= len(suppliers_list):
                    selected_data["metal"] = raw_materials[raw_materials["part_id"] == suppliers_list[selection - 1]]
                    print(f"✓ Selected: {suppliers_list[selection - 1]}")
                    break
                else:
                    print(f"❌ Invalid selection. Please enter 1-{len(suppliers_list)} or 0.")
            except ValueError:
                print("❌ Please enter a valid number.")
    
    if components_to_calculate["machining"]:
        print("\n" + "-"*70)
        print("STEP 2B: SELECT MACHINING DATA")
        print("-"*70)
        machining_df = load_machining_data()
        part_ids = machining_df["part_id"].unique()
        part_ids_list = list(part_ids)
        
        print(f"\nAvailable Parts ({len(part_ids_list)} total):")
        for i, part_id in enumerate(part_ids_list, 1):
            part_data = machining_df[machining_df["part_id"] == part_id]
            cost = part_data["machining_cost_sgd"].sum()
            year = part_data["invoice_year"].values[0]
            print(f"{i:3d}. {part_id:10s} ({year}) - SGD {cost:>12,.2f}")
        
        print("\n" + "-"*70)
        while True:
            try:
                selection = int(input(f"Enter part number (1-{len(part_ids_list)}) or 0 for all: "))
                if selection == 0:
                    selected_data["machining"] = machining_df
                    print(f"✓ Selected: All {len(machining_df)} machining records")
                    break
                elif 1 <= selection <= len(part_ids_list):
                    selected_data["machining"] = machining_df[machining_df["part_id"] == part_ids_list[selection - 1]]
                    print(f"✓ Selected: {part_ids_list[selection - 1]}")
                    break
                else:
                    print(f"❌ Invalid selection. Please enter 1-{len(part_ids_list)} or 0.")
            except ValueError:
                print("❌ Please enter a valid number.")
    
    if components_to_calculate["surface"]:
        print("\n" + "-"*70)
        print("STEP 2C: SURFACE TREATMENT")
        print("-"*70)
        surface_df = load_surface_data()
        print(f"\nSurface Treatment (aggregated monthly cost):")
        print(f"  Cost: SGD 5,508.00 (monthly aggregated)")
        selected_data["surface"] = surface_df
        print(f"✓ Selected: Surface Treatment")
    
    # Step 3: Calculate emissions
    print("\n" + "-"*70)
    print("STEP 3: CALCULATING EMISSIONS")
    print("-"*70)
    print("\nProcessing calculations...")
    
    results = calculate_custom_emissions(selected_data, components_to_calculate)
    
    if results is None or len(results) == 0:
        print("❌ No data to calculate.")
        return
    
    # Display results
    display_custom_results(results, components_to_calculate)
    
    # Option to save results
    save_option = input("\nSave results to Excel file? (y/n): ").lower()
    if save_option == 'y':
        filename = f"emission_results_{pd.Timestamp.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        results.to_excel(filename, index=False)
        print(f"✓ Results saved to '{filename}'")


def calculate_custom_emissions(selected_data, components):
    """Calculate emissions based on selected components"""
    
    results_list = []
    
    if components["metal"] and "metal" in selected_data:
        raw_df = selected_data["metal"].copy()
        
        # METAL conversion and calculation
        raw_df[["usd", "usd_2022", "metal_emission"]] = raw_df.apply(
            lambda x: pd.Series(compute_component_emission(
                x.cost_sgd, x.year, USEEIO_FACTORS["metal"]
            )),
            axis=1,
        )
        raw_df["component"] = "Metal/Raw Material"
        raw_df["cost_sgd_input"] = raw_df["cost_sgd"]
        raw_df["usd_2022_converted"] = raw_df["usd_2022"]
        
        results_list.append(raw_df[["part_id", "component", "cost_sgd_input", "usd_2022_converted", "metal_emission"]])
    
    if components["machining"] and "machining" in selected_data:
        machining_df = selected_data["machining"].copy()
        
        # MACHINING conversion and calculation
        machining_df[["usd", "usd_2022", "machining_emission"]] = machining_df.apply(
            lambda x: pd.Series(compute_component_emission(
                x.machining_cost_sgd, x.invoice_year, USEEIO_FACTORS["machining"]
            )),
            axis=1,
        )
        machining_df["component"] = "Machining/Fabrication"
        machining_df["cost_sgd_input"] = machining_df["machining_cost_sgd"]
        machining_df["usd_2022_converted"] = machining_df["usd_2022"]
        
        results_list.append(machining_df[["part_id", "component", "cost_sgd_input", "usd_2022_converted", "machining_emission"]])
    
    if components["surface"] and "surface" in selected_data:
        surface_df = selected_data["surface"].copy()
        
        # SURFACE conversion and calculation
        surface_df[["usd", "usd_2022", "surface_emission"]] = surface_df.apply(
            lambda x: pd.Series(compute_component_emission(
                x.cost_sgd, x.year, USEEIO_FACTORS["surface"]
            )),
            axis=1,
        )
        surface_df["component"] = "Surface Treatment"
        surface_df["cost_sgd_input"] = surface_df["cost_sgd"]
        surface_df["usd_2022_converted"] = surface_df["usd_2022"]
        
        results_list.append(surface_df[["part_id", "component", "cost_sgd_input", "usd_2022_converted", "surface_emission"]])
    
    if not results_list:
        return None
    
    # Combine all results
    combined_results = pd.concat(results_list, ignore_index=True)
    
    # Calculate total emissions
    combined_results["emission_value"] = combined_results[
        [col for col in ["metal_emission", "machining_emission", "surface_emission"] if col in combined_results.columns]
    ].sum(axis=1)
    
    return combined_results


def display_custom_results(result_df, components):
    """Display custom calculation results"""
    print("\n" + "="*80)
    print("EMISSION CALCULATION RESULTS")
    print("="*80)
    
    component_names = []
    if components["metal"]:
        component_names.append("Metal/Raw Material")
    if components["machining"]:
        component_names.append("Machining/Fabrication")
    if components["surface"]:
        component_names.append("Surface Treatment")
    
    print(f"\nComponents calculated: {', '.join(component_names)}")
    print(f"Total records: {len(result_df)}\n")
    
    for idx, row in result_df.iterrows():
        print(f"\n{'─'*80}")
        print(f"RECORD {idx + 1}: {row['part_id']} | {row['component']}")
        print(f"{'─'*80}")
        
        print(f"\n  Input Cost (SGD):              SGD {row['cost_sgd_input']:>12,.2f}")
        print(f"  Converted to 2022 USD:         USD {row['usd_2022_converted']:>12,.2f}")
        
        if "metal_emission" in row and pd.notna(row["metal_emission"]):
            factor = USEEIO_FACTORS["metal"]
            print(f"  Emission Factor (Metal):       {factor} kg CO2/USD")
            print(f"  Calculated Emissions:          {row['metal_emission']:>15,.2f} kg CO2")
        
        if "machining_emission" in row and pd.notna(row["machining_emission"]):
            factor = USEEIO_FACTORS["machining"]
            print(f"  Emission Factor (Machining):   {factor} kg CO2/USD")
            print(f"  Calculated Emissions:          {row['machining_emission']:>15,.2f} kg CO2")
        
        if "surface_emission" in row and pd.notna(row["surface_emission"]):
            factor = USEEIO_FACTORS["surface"]
            print(f"  Emission Factor (Surface):     {factor} kg CO2/USD")
            print(f"  Calculated Emissions:          {row['surface_emission']:>15,.2f} kg CO2")
    
    # Summary
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    
    if "metal_emission" in result_df.columns:
        metal_total = result_df["metal_emission"].sum()
        print(f"\nTotal Metal Emissions:         {metal_total:>15,.2f} kg CO2")
    
    if "machining_emission" in result_df.columns:
        machining_total = result_df["machining_emission"].sum()
        print(f"Total Machining Emissions:     {machining_total:>15,.2f} kg CO2")
    
    if "surface_emission" in result_df.columns:
        surface_total = result_df["surface_emission"].sum()
        print(f"Total Surface Emissions:       {surface_total:>15,.2f} kg CO2")
    
    total_emissions = result_df["emission_value"].sum()
    print(f"\n{'─'*50}")
    print(f"TOTAL COMBINED EMISSIONS:      {total_emissions:>15,.2f} kg CO2")
    print("="*80 + "\n")


def mode2_batch_all():
    """Mode 2: Calculate emissions for all parts from Excel"""
    print("\n" + "="*70)
    print("MODE 2: BATCH CALCULATION - ALL PARTS")
    print("="*70)
    
    print("\nLoading all parts from Excel files...")
    raw_df = load_raw_materials()
    
    print(f"✓ Found {len(raw_df)} parts. Calculating emissions...")
    
    results = calculate_emissions_from_selection(raw_df)
    
    print("\n" + "="*70)
    print("SUMMARY OF ALL PARTS")
    print("="*70)
    print(f"\nTotal parts processed: {len(results)}")
    print(f"Total emissions: {results['total_emission'].sum():,.2f} kg CO2")
    print(f"Average emissions per part: {results['total_emission'].mean():,.2f} kg CO2")
    
    print("\n" + "-"*70)
    print(results.to_string())
    
    results.to_excel("final_emission_output.xlsx", index=False)
    print(f"\n✓ Results saved to 'final_emission_output.xlsx'")


def mode3_manual_input():
    """Mode 3: Manual input for custom calculation"""
    print("\n" + "="*60)
    print("MODE 3: MANUAL INPUT - CUSTOM CALCULATION")
    print("="*60 + "\n")


def transport_emission_calc_mode():
    """Interactive transportation emissions calculator."""
    print("\n" + "="*70)
    print("TRANSPORTATION EMISSIONS CALCULATOR")
    print("="*70 + "\n")

    countries = sorted(list(DISTANCES_TO_SINGAPORE_KM.keys()))
    print("Available source countries:")
    for i, c in enumerate(countries, 1):
        print(f"{i:3d}. {c}")

    while True:
        try:
            sel = int(input(f"Select country number (1-{len(countries)}): "))
            if 1 <= sel <= len(countries):
                country = countries[sel - 1]
                break
        except ValueError:
            pass
        print("❌ Invalid selection. Try again.")

    modes = ["sea", "land", "air"]
    print("\nSelect transport mode:")
    for i, m in enumerate(modes, 1):
        print(f"{i:3d}. {m.capitalize()}")

    while True:
        try:
            sel = int(input(f"Select mode number (1-{len(modes)}): "))
            if 1 <= sel <= len(modes):
                chosen_mode = modes[sel - 1]
                break
        except ValueError:
            pass
        print("❌ Invalid selection. Try again.")

    while True:
        w = input(f"Enter shipment weight in kg (default {DEFAULT_WEIGHT_KG}): ").strip()
        if w == "":
            weight_kg = DEFAULT_WEIGHT_KG
            break
        try:
            weight_kg = float(w)
            if weight_kg > 0:
                break
        except ValueError:
            pass
        print("❌ Please enter a positive number.")

    distance_km = DISTANCES_TO_SINGAPORE_KM.get(country, None)
    if distance_km is None:
        while True:
            d = input("Enter estimated distance to Singapore in km: ")
            try:
                distance_km = float(d)
                if distance_km > 0:
                    break
            except ValueError:
                pass
            print("❌ Please enter a positive number.")

    tonnes = weight_kg / 1000.0
    emissions_by_mode = {}
    for m, factor in EMISSION_FACTORS_KG_PER_TKM.items():
        emissions_by_mode[m] = calculate_transport_emission(weight_kg, distance_km, factor)

    chosen_emission = emissions_by_mode[chosen_mode]

    print("\n" + "-"*60)
    print(f"Source country: {country}")
    print(f"Distance to Singapore (approx): {distance_km:,.0f} km")
    print(f"Shipment weight: {weight_kg:,.2f} kg ({tonnes:.4f} t)")
    print(f"Chosen mode: {chosen_mode.capitalize()}")
    print(f"Estimated transport emissions: {chosen_emission:,.2f} kg CO2")
    print("\nComparative emissions by mode:")
    for m in modes:
        marker = "<- chosen" if m == chosen_mode else ""
        print(f"  {m.capitalize():6s}: {emissions_by_mode[m]:10,.2f} kg CO2 {marker}")

    sorted_modes = sorted(emissions_by_mode.items(), key=lambda x: x[1])
    best_mode, best_val = sorted_modes[0]
    worst_mode, worst_val = sorted_modes[-1]

    if chosen_mode == worst_mode and worst_val > best_val * 1.10:
        print("\n⚠️  Warning: The selected transport mode has significantly higher emissions.")
        suggestions = [m for m, v in sorted_modes if v <= best_val * 1.25]
        sug_text = ", ".join([s.capitalize() for s in suggestions if s != chosen_mode])
        if sug_text:
            print(f"Suggestion: consider using {sug_text} instead to reduce emissions.")
        else:
            print("Suggestion: consider reducing shipment weight or consolidating shipments.")
    else:
        print("\n✓ The chosen transport mode is reasonable compared to alternatives.")

    print("\n" + "="*60 + "\n")

    return {
        "country": country,
        "distance_km": distance_km,
        "weight_kg": weight_kg,
        "chosen_mode": chosen_mode,
        "chosen_emission_kgco2": chosen_emission,
        "emissions_by_mode": emissions_by_mode,
    }

    part_name = input("Enter part/product name: ")
    year = int(input("Enter year (2023-2026): "))

    metal_cost_sgd = float(input("Enter metal cost (SGD): "))
    machining_cost_sgd = float(input("Enter machining/fabrication cost (SGD): "))
    surface_cost_sgd = float(input("Enter surface treatment cost (SGD): "))

    result = compute_from_sgd_amounts(
        year, metal_cost_sgd, machining_cost_sgd, surface_cost_sgd
    )
    calc = result["calculation"]
    emissions = result["emissions"]
    usd2022 = calc["usd2022_amounts"]

    print("\n" + "="*60)
    print("CALCULATION RESULTS")
    print("="*60)
    print(f"Part Name: {part_name}")
    print(f"Year: {year}\n")

    print("COSTS (Original SGD):")
    print(f"  Metal cost:              SGD {metal_cost_sgd:,.2f}")
    print(f"  Machining cost:          SGD {machining_cost_sgd:,.2f}")
    print(f"  Surface treatment cost:  SGD {surface_cost_sgd:,.2f}")
    print(
        f"  Total cost:              SGD {metal_cost_sgd + machining_cost_sgd + surface_cost_sgd:,.2f}\n"
    )

    print("COSTS CONVERTED (2022 USD):")
    print(f"  Metal:                   ${usd2022['raw_material']:,.2f}")
    print(f"  Machining:               ${usd2022['fabrication']:,.2f}")
    print(f"  Surface treatment:       ${usd2022['surface_treatment']:,.2f}\n")

    print("EMISSION FACTORS (kg CO2 / USD):")
    print(f"  Metal:                   {USEEIO_FACTORS['metal']} kg CO2/USD")
    print(f"  Machining:               {USEEIO_FACTORS['machining']} kg CO2/USD")
    print(f"  Surface treatment:       {USEEIO_FACTORS['surface']} kg CO2/USD\n")

    print("CALCULATED EMISSIONS (kg CO2):")
    print(f"  Metal emissions:         {emissions['raw_material']:,.2f} kg CO2")
    print(f"  Machining emissions:     {emissions['fabrication']:,.2f} kg CO2")
    print(f"  Surface treatment:       {emissions['surface_treatment']:,.2f} kg CO2")
    print(f"  " + "-"*50)
    print(f"  TOTAL EMISSIONS:         {emissions['total']:,.2f} kg CO2")
    print("="*60 + "\n")


def main_menu():
    """Main menu for user to choose calculation method"""
    while True:
        print("\n" + "="*70)
        print("USEEIO EMISSION CALCULATOR")
        print("="*70)
        print("\n1. Select and calculate specific parts from Excel")
        print("2. Batch calculate all parts from Excel")
        print("3. Manual input (custom calculation)")
        print("4. Exit")
        print("5. Transportation calculation (choose mode & country)")
        
        choice = input("\nSelect option (1-4): ")
        
        if choice == "1":
            try:
                mode1_selective_calculation()
            except Exception as e:
                print(f"\n❌ Error: {e}")
            
        elif choice == "2":
            try:
                mode2_batch_all()
            except Exception as e:
                print(f"\n❌ Error: {e}")
            
        elif choice == "3":
            try:
                mode3_manual_input()
            except Exception as e:
                print(f"\n❌ Error: {e}")
                print("Please enter valid numbers.")
            
        elif choice == "4":
            print("\nExiting...")
            break
        elif choice == "5":
            try:
                transport_emission_calc_mode()
            except Exception as e:
                print(f"\n❌ Error: {e}")
        else:
            print("\n❌ Invalid option. Please try again.")


# ------------------------------
# 6. Run script
# ------------------------------

if __name__ == "__main__":
    main_menu()
