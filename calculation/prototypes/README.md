# Calculation prototypes

This directory contains the original spreadsheet-driven experiments and their
sample workbooks. The Electron application and FastAPI backend do not import
these modules.

Production formulas live in `calculation/engine.py`, Method 2 logic lives in
`calculation/method2_calculations.py`, and transport reference helpers live in
`calculation/transport_data.py`.

Run the interactive prototype from this directory so its workbook paths remain
local, while exposing the repository root for production calculation imports:

```bash
cd calculation/prototypes
PYTHONPATH=../.. python3 main.py
```
