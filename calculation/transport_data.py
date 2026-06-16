"""Transport reference data: distances (km) and mode emission factors (kg CO2 per tonne-km).

This is a lightweight dataset used by the interactive transport calculator.
"""

# Approximate great-circle / realistic route distances to Singapore (port/hub), in km.
# These are coarse and intended for illustrative calculations only.
DISTANCES_TO_SINGAPORE_KM = {
    "Singapore": 50,
    "China": 3600,  # Shanghai ~ 3.6k km
    "Japan": 5300,
    "South Korea": 3800,
    "Vietnam": 1700,
    "Indonesia": 1500,
    "Malaysia": 400,
    "Thailand": 1400,
    "Philippines": 1700,
    "Cambodia": 1500,
    "Laos": 1600,
    "United States": 15300,
    "Germany": 10400,
    "India": 4300,
    "Brazil": 17500,
    "Australia": 3800,
    "Canada": 13800,
}

# Typical emission factors by transport mode (kg CO2 per tonne-km)
# Values are approximate averages used for high-level comparisons.
EMISSION_FACTORS_KG_PER_TKM = {
    "sea": 0.015,   # ~15 g / tkm
    "land": 0.120,  # ~120 g / tkm (road/rail blended)
    "air": 1.200,   # ~1.2 kg / tkm
}

DEFAULT_WEIGHT_KG = 100.0  # default shipment weight per part if user doesn't provide
