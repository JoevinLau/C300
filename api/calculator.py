# calculator.py
from typing import Any, Dict


def _sgd_to_usd_2022(amount_sgd: float, fx: float, inflation_index: float) -> float:
    amount_usd = amount_sgd * fx
    return amount_usd * (100.0 / inflation_index)


def _sgd_to_usd(amount_sgd: float, fx: float) -> float:
    return amount_sgd * fx


def compute_emissions(payload: Dict[str, Any]) -> Dict[str, Any]:
    total_sgd = payload["total_amount_sgd"]
    allocation = payload["allocation"]
    fx = payload["fx"]
    inflation = payload["inflation"]
    factors = payload["factors"]

    raw_sgd = total_sgd * allocation["raw_material_pct"] / 100.0
    fab_sgd = total_sgd * allocation["fabrication_pct"] / 100.0
    surf_sgd = total_sgd * allocation["surface_treatment_pct"] / 100.0
#addline
    raw_usd = _sgd_to_usd(raw_sgd, fx)
    fab_usd = _sgd_to_usd(fab_sgd, fx)
    surf_usd = _sgd_to_usd(surf_sgd, fx)

    raw_usd2022 = _sgd_to_usd_2022(raw_sgd, fx, inflation)
    fab_usd2022 = _sgd_to_usd_2022(fab_sgd, fx, inflation)
    surf_usd2022 = _sgd_to_usd_2022(surf_sgd, fx, inflation)

    raw_emission = raw_usd2022 * factors["raw_material"]
    fab_emission = fab_usd2022 * factors["fabrication"]
    surf_emission = surf_usd2022 * factors["surface_treatment"]
#addline here
    return {
        "calculation": {
            "fx_rate": fx,
            "inflation_index": inflation,
            "year": payload["year"],
            "sgd_amounts": {
                "raw_material": raw_sgd,
                "fabrication": fab_sgd,
                "surface_treatment": surf_sgd,
            },
            "usd_amounts": {
                "raw_material": raw_usd,
                "fabrication": fab_usd,
                "surface_treatment": surf_usd,
            },
            "usd2022_amounts": {
                "raw_material": raw_usd2022,
                "fabrication": fab_usd2022,
                "surface_treatment": surf_usd2022,
            },
            "factors": {
                "raw_material": factors["raw_material"],
                "fabrication": factors["fabrication"],
                "surface_treatment": factors["surface_treatment"],
            },
  #  addline to here        
        },
        "costs": {
            "raw_material_usd2022": raw_usd2022,
            "fabrication_usd2022": fab_usd2022,
            "surface_treatment_usd2022": surf_usd2022,
        },
        "emissions": {
            "raw_material": raw_emission,
            "fabrication": fab_emission,
            "surface_treatment": surf_emission,
            "total": raw_emission + fab_emission + surf_emission,
        },
    }
