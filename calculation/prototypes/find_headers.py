import openpyxl
import pandas as pd

wb = openpyxl.load_workbook("raw_material.xlsx")
ws = wb.active

print("First 15 rows of raw_material.xlsx:")
print("=" * 100)
for i, row in enumerate(ws.iter_rows(min_row=1, max_row=15, values_only=True), 1):
    print(f"Row {i}: {row}")

print("\n" + "=" * 100)
print("Trying to read with different header row options:")
print("=" * 100)

# Try with header=None to see all rows
df = pd.read_excel("raw_material.xlsx", sheet_name=0, header=None)
print(f"\nDataFrame shape (header=None): {df.shape}")
print(f"First 10 rows:")
print(df.head(10))

# Try to find where actual headers are
print("\n" + "=" * 100)
print("Looking for actual headers (rows with multiple non-null values):")
for idx, row in df.head(10).iterrows():
    non_null_count = row.count()
    print(f"Row {idx}: {non_null_count} non-null values - {list(row[:5])}")
