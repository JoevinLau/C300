#dev_data.py
# Fallback reference data when cloud database is unavailable

DEV_NAICS_OPTIONS = [
    {"code": "325220", "description": "Artificial and Synthetic Fibers,Manufacturing", "category": "raw_material", "kgco2e_per_usd": 0.902},
    {"code": "326113", "description": "Unlaminated Plastics Film and Sheet Manufacturing", "category": "raw_material", "kgco2e_per_usd": 0.544},
    {"code": "326130", "description": "Plastics Pipe, Pipe Fitting, and Unlaminated Profile Shape Manufacturing", "category": "raw_material", "kgco2e_per_usd": 0.460},
    {"code": "326199", "description": "All Other Plastics Product Manufacturing", "category": "raw_material", "kgco2e_per_usd": 0.371},
    {"code": "331110", "description": "Iron and Steel Mills and Ferroalloy Manufacturing", "category": "raw_material", "kgco2e_per_usd": 0.787},
    {"code": "331313", "description": "Alumina Refining and Primary Aluminum Production", "category": "raw_material", "kgco2e_per_usd": 1.018},
    {"code": "331315", "description": "Aluminum Sheet, Plate, and Foil Manufacturing", "category": "raw_material", "kgco2e_per_usd": 0.721},
    {"code": "331318", "description": "Other Aluminum Rolling, Drawing, and Extruding", "category": "raw_material", "kgco2e_per_usd": 0.721},
    {"code": "331410", "description": "Nonferrous Metal Smelting and Refining", "category": "raw_material", "kgco2e_per_usd": 0.423},
    {"code": "331420", "description": "Copper Rolling, Drawing, Extruding, and Alloying", "category": "raw_material", "kgco2e_per_usd": 0.334},
    {"code": "331491", "description": "Nonferrous Metal Rolling, Drawing, and Extruding", "category": "raw_material", "kgco2e_per_usd": 0.431},
    {"code": "335991", "description": "Other Electrical Equipment Manufacturing", "category": "raw_material", "kgco2e_per_usd": 0.363},
    {"code": "332322", "description": "Sheet Metal Work Manufacturing", "category": "fabrication", "kgco2e_per_usd": 0.221},
    {"code": "332710", "description": "Machine Shops", "category": "fabrication", "kgco2e_per_usd": 0.278},
    {"code": "332999", "description": "All Other Miscellaneous Fabricated Metal Product Manufacturing", "category": "fabrication", "kgco2e_per_usd": 0.272},
    {"code": "333249", "description": "Other Industrial Machinery Manufacturing", "category": "fabrication", "kgco2e_per_usd": 0.185},
    {"code": "333515", "description": "Cutting Tool and Machine Tool Accessory Manufacturing", "category": "fabrication", "kgco2e_per_usd": 0.207},
    {"code": "333517", "description": "Machine Tool Manufacturing", "category": "fabrication", "kgco2e_per_usd": 0.199},
    {"code": "332811", "description": "Metal Heat Treating", "category": "surface_treatment", "kgco2e_per_usd": 0.382},
    {"code": "332812", "description": "Metal Coating and Allied Services", "category": "surface_treatment", "kgco2e_per_usd": 0.382},
    {"code": "332813", "description": "Electroplating Plating, Polishing, Anodizing, and Coloring", "category": "surface_treatment", "kgco2e_per_usd": 0.382},
]

DEV_FX_INFLATION = {
    2022: (0.7437, 118.012),
    2023: (0.7584, 122.382),
    2024: (0.7351, 125.422),
    2025: (0.7788, 128.970),
    2026: (0.7788, 128.970),
}
