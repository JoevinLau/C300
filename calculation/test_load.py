import pandas as pd

print("=" * 60)
print("Testing raw_material.xlsx loading")
print("=" * 60)

raw_df = pd.read_excel("raw_material.xlsx", sheet_name=0, header=0)
print(f"Shape: {raw_df.shape}")
print(f"Columns: {list(raw_df.columns)}")
print(f"\nFirst 5 rows:")
print(raw_df.head())

# Try to extract part_id and cost
print("\n" + "=" * 60)
print("Extracting part_id and cost columns")
print("=" * 60)

try:
    part_id = raw_df.iloc[:, 1].astype(str)
    cost = pd.to_numeric(raw_df.iloc[:, -2], errors='coerce')
    
    print(f"part_id (column B) first 5 values:\n{part_id.head()}")
    print(f"\ncost (second to last column) first 5 values:\n{cost.head()}")
    
    # Create clean dataframe
    raw_df_clean = pd.DataFrame({
        "part_id": part_id,
        "year": 2026,
        "cost_sgd": cost
    })
    raw_df_clean = raw_df_clean.dropna()
    
    print(f"\nCleaned DataFrame shape: {raw_df_clean.shape}")
    print(f"Cleaned DataFrame dtypes:\n{raw_df_clean.dtypes}")
    print(f"\nFirst 5 rows of cleaned data:")
    print(raw_df_clean.head())
    
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
