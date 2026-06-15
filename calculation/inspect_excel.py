import pandas as pd

# Inspect raw_material.xlsx
print("=" * 50)
print("raw_material.xlsx")
print("=" * 50)
raw_df = pd.read_excel("raw_material.xlsx", sheet_name=0)
print(f"Columns: {list(raw_df.columns)}")
print(f"Shape: {raw_df.shape}")
print("\nFirst few rows:")
print(raw_df.head())

# Inspect treatment_cost.xlsx
print("\n" + "=" * 50)
print("treatment_cost.xlsx")
print("=" * 50)
surface_df = pd.read_excel("treatment_cost.xlsx", sheet_name=0)
print(f"Columns: {list(surface_df.columns)}")
print(f"Shape: {surface_df.shape}")
print("\nFirst few rows:")
print(surface_df.head())

# Inspect fake_machining_cost.xlsx
print("\n" + "=" * 50)
print("fake_machining_cost.xlsx")
print("=" * 50)
machining_df = pd.read_excel("fake_machining_cost.xlsx", sheet_name=0)
print(f"Columns: {list(machining_df.columns)}")
print(f"Shape: {machining_df.shape}")
print("\nFirst few rows:")
print(machining_df.head())
