"""Method 2 calculation engine.

The temporary machine library below is the current data source layer. Replace
`StaticMachineDataSource` with a database-backed implementation when the
machine database is introduced.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Protocol


@dataclass(frozen=True)
class MachineReference:
    machine_type: str
    duty_level: str
    avg_kw: float
    hourly_emission: float


@dataclass(frozen=True)
class MachiningEntry:
    machine_type: str
    duty_level: str
    operating_hours: float


class MachineDataSource(Protocol):
    def list_machines(self) -> list[MachineReference]:
        ...

    def get_machine(self, machine_type: str, duty_level: str) -> MachineReference:
        ...


class StaticMachineDataSource:
    """Temporary demo source. Swap this class for a database adapter later."""

    _machines = [
        MachineReference("CNC Milling", "Light", 7.15, 2.98),
        MachineReference("CNC Milling", "Medium", 14.30, 5.96),
        MachineReference("CNC Milling", "Heavy", 29.25, 12.19),
    ]

    def list_machines(self) -> list[MachineReference]:
        return list(self._machines)

    def get_machine(self, machine_type: str, duty_level: str) -> MachineReference:
        for machine in self._machines:
            if (
                machine.machine_type.lower() == machine_type.lower()
                and machine.duty_level.lower() == duty_level.lower()
            ):
                return machine
        raise ValueError(f"No machine reference found for {machine_type} / {duty_level}")


DEFAULT_MACHINE_SOURCE = StaticMachineDataSource()
SpendCalculator = Callable[[dict[str, Any]], dict[str, Any]]


def serialize_machine(machine: MachineReference) -> dict[str, Any]:
    return {
        "machineType": machine.machine_type,
        "dutyLevel": machine.duty_level,
        "avgKW": machine.avg_kw,
        "hourlyEmission": machine.hourly_emission,
    }


def list_machine_library(data_source: MachineDataSource = DEFAULT_MACHINE_SOURCE) -> list[dict[str, Any]]:
    return [serialize_machine(machine) for machine in data_source.list_machines()]


def compute_machining_emissions(
    entries: list[MachiningEntry],
    data_source: MachineDataSource = DEFAULT_MACHINE_SOURCE,
) -> dict[str, Any]:
    entry_results: list[dict[str, Any]] = []
    total = 0.0

    for entry in entries:
        if entry.operating_hours < 0:
            raise ValueError("Operating hours cannot be negative")

        machine = data_source.get_machine(entry.machine_type, entry.duty_level)
        emissions = machine.hourly_emission * entry.operating_hours
        total += emissions
        entry_results.append(
            {
                "machineType": machine.machine_type,
                "dutyLevel": machine.duty_level,
                "avgKW": machine.avg_kw,
                "hourlyEmission": machine.hourly_emission,
                "operatingHours": entry.operating_hours,
                "emissions": emissions,
            }
        )

    return {"entries": entry_results, "total": total}


def compute_method2(payload: dict[str, Any], spend_calculator: SpendCalculator) -> dict[str, Any]:
    """Compute Method 2 while reusing Method 1 spend-based calculations."""

    method1_payload = {
        "invoice_id": payload["part_id"],
        "year": payload["year"],
        "total_amount_sgd": payload["raw_material_sgd"] + payload["surface_treatment_sgd"],
        "sgd_amounts": {
            "raw_material": payload["raw_material_sgd"],
            "fabrication": 0,
            "surface_treatment": payload["surface_treatment_sgd"],
        },
        "naics": {
            "raw_material": payload["naics"]["raw_material"],
            "fabrication": payload["naics"].get("fabrication", "333517"),
            "surface_treatment": payload["naics"]["surface_treatment"],
        },
    }
    spend_result = spend_calculator(method1_payload)

    machining_entries = [
        MachiningEntry(
            machine_type=item["machine_type"],
            duty_level=item["duty_level"],
            operating_hours=float(item["operating_hours"]),
        )
        for item in payload.get("machining_entries", [])
    ]
    machining = compute_machining_emissions(machining_entries)

    transport_emissions = float(payload.get("transport_emissions_kg") or 0)
    raw_material = float(spend_result["emissions"]["raw_material"])
    surface_treatment = float(spend_result["emissions"]["surface_treatment"])
    machining_total = float(machining["total"])

    total = raw_material + transport_emissions + surface_treatment + machining_total

    return {
        "part_id": payload["part_id"],
        "calculation": spend_result["calculation"],
        "costs": {
            "raw_material_usd2022": spend_result["costs"]["raw_material_usd2022"],
            "surface_treatment_usd2022": spend_result["costs"]["surface_treatment_usd2022"],
        },
        "machining": machining,
        "transport": {
            "emissions": transport_emissions,
            "source": payload.get("transport_source", "EcoTransit World"),
        },
        "emissions": {
            "raw_material": raw_material,
            "transportation": transport_emissions,
            "surface_treatment": surface_treatment,
            "machining": machining_total,
            "total": total,
        },
        "notes": {
            "raw_material": "Reuses Method 1 spend-based pipeline.",
            "surface_treatment": "Reuses Method 1 spend-based pipeline.",
            "transportation": "Use the existing /ecotransit endpoint to populate transport_emissions_kg.",
            "machining": "Temporary static machine data source; replace StaticMachineDataSource with a database adapter later.",
        },
    }
