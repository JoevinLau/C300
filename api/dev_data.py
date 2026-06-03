# Fallback reference data when MySQL is unavailable (aligned with calculation/main.py).
DEV_FX_INFLATION: dict[int, tuple[float, float]] = {
    2023: (0.75, 103.2),
    2024: (0.74, 106.5),
    2025: (0.73, 109.0),
    2026: (0.72, 111.5),
}

DEV_NAICS_CATALOG: list[dict[str, object]] = [
    {
        "code": "332710",
        "description": "Machine Shops",
        "kgco2e_per_usd": 0.85,
    },
    {
        "code": "332812",
        "description": "Metal Coating, Engraving (except Jewelry and Silverware), and Allied Services",
        "kgco2e_per_usd": 1.20,
    },
    {
        "code": "333249",
        "description": "Other Industrial Machinery Manufacturing",
    },
    {
        "code": "331110",
        "description": "Iron and Steel Mills and Ferroalloy Manufacturing",
    },
    {
        "code": "332322",
        "description": "Sheet Metal Work Manufacturing",
    },
    {
        "code": "332313",
        "description": "Plate Work Manufacturing",
    },
    {
        "code": "332721",
        "description": "Precision Turned Product Manufacturing",
    },
    {
        "code": "332999",
        "description": "All Other Miscellaneous Fabricated Metal Product Manufacturing",
    },
]

DEV_NAICS_FACTORS: dict[str, float] = {
    item["code"]: float(item["kgco2e_per_usd"])  # type: ignore[arg-type]
    for item in DEV_NAICS_CATALOG
    if "kgco2e_per_usd" in item
}
