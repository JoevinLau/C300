"""Method 2 calculation engine backed by authoritative reference tables."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Protocol


@dataclass(frozen=True)
class MachineReference:
    machine_type: str
    duty_level: str
    avg_kw: float
    hourly_emission: float
    country_code: str
    grid_factor: float
    grid_year: int
    grid_source: str
    data_source: str


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


class DatabaseMachineDataSource:
    """Machine source backed by Method 2 database tables."""

    def __init__(self, country_code: str = "SG") -> None:
        self.country_code = country_code

    def _grid_factor(self, cursor: Any) -> dict[str, Any]:
        cursor.execute(
            """
            SELECT country_code, year, kgco2e_per_kwh, data_source
            FROM method2_grid_electricity_factors
            WHERE country_code = %s
            ORDER BY year DESC, id DESC
            LIMIT 1
            """,
            (self.country_code,),
        )
        row = cursor.fetchone()
        if not row:
            raise ValueError(f"No grid electricity factor found for {self.country_code}")
        return dict(row)

    def _rows(self) -> list[dict[str, Any]]:
        try:
            from db import get_conn
        except ModuleNotFoundError:
            from api.db import get_conn

        conn = get_conn()
        try:
            cursor = conn.cursor(dictionary=True)
            try:
                grid_factor = self._grid_factor(cursor)
                cursor.execute(
                    """
                    SELECT machine_name, duty_level, avg_operating_load_kw, country_code, data_source
                    FROM method2_machine_profiles
                    WHERE country_code = %s
                    ORDER BY machine_name, duty_level
                    """,
                    (self.country_code,),
                )
                rows = cursor.fetchall()
            finally:
                cursor.close()
        finally:
            conn.close()

        if not rows:
            raise ValueError(f"No machine profiles found for {self.country_code}")

        for row in rows:
            row["grid_factor"] = float(grid_factor["kgco2e_per_kwh"])
            row["grid_year"] = int(grid_factor["year"])
            row["grid_source"] = str(grid_factor["data_source"])
            row["hourly_emission"] = float(row["avg_operating_load_kw"]) * row["grid_factor"]
        return rows

    def list_machines(self) -> list[MachineReference]:
        return [
            MachineReference(
                machine_type=str(row["machine_name"]),
                duty_level=str(row["duty_level"]),
                avg_kw=float(row["avg_operating_load_kw"]),
                hourly_emission=float(row["hourly_emission"]),
                country_code=str(row["country_code"]),
                grid_factor=float(row["grid_factor"]),
                grid_year=int(row["grid_year"]),
                grid_source=str(row["grid_source"]),
                data_source=str(row["data_source"]),
            )
            for row in self._rows()
        ]

    def get_machine(self, machine_type: str, duty_level: str) -> MachineReference:
        normalized_machine_type = machine_type.casefold()
        normalized_duty_level = duty_level.casefold()
        for machine in self.list_machines():
            if (
                machine.machine_type.casefold() == normalized_machine_type
                and machine.duty_level.casefold() == normalized_duty_level
            ):
                return machine
        raise ValueError(f"No machine reference found for {machine_type} / {duty_level}")


DEFAULT_MACHINE_SOURCE: MachineDataSource = DatabaseMachineDataSource()
SpendCalculator = Callable[[dict[str, Any]], dict[str, Any]]


class MachineReferenceDataUnavailable(RuntimeError):
    """Raised when Method 2 cannot load authoritative machine or grid data."""


def _is_database_error(exc: BaseException) -> bool:
    return exc.__class__.__module__.startswith("mysql") or exc.__class__.__name__ in {"DatabaseUnavailable", "ModuleNotFoundError"}


def _is_missing_reference_data(exc: BaseException) -> bool:
    message = str(exc)
    return message.startswith("No machine profiles found") or message.startswith("No grid electricity factor found")


def _with_authoritative_source(fn: Callable[[MachineDataSource], Any]) -> Any:
    try:
        return fn(DEFAULT_MACHINE_SOURCE)
    except Exception as exc:
        if _is_database_error(exc) or _is_missing_reference_data(exc):
            raise MachineReferenceDataUnavailable(
                "Authoritative Method 2 machine and grid reference data is unavailable."
            ) from exc
        raise


def serialize_machine(machine: MachineReference) -> dict[str, Any]:
    return {
        "machineType": machine.machine_type,
        "dutyLevel": machine.duty_level,
        "avgKW": machine.avg_kw,
        "hourlyEmission": machine.hourly_emission,
        "countryCode": machine.country_code,
        "gridFactor": machine.grid_factor,
        "gridYear": machine.grid_year,
        "gridSource": machine.grid_source,
        "dataSource": machine.data_source,
    }


def list_machine_library(data_source: MachineDataSource = DEFAULT_MACHINE_SOURCE) -> list[dict[str, Any]]:
    if data_source is DEFAULT_MACHINE_SOURCE:
        return _with_authoritative_source(
            lambda source: [serialize_machine(machine) for machine in source.list_machines()]
        )
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

        if data_source is DEFAULT_MACHINE_SOURCE:
            machine = _with_authoritative_source(
                lambda source: source.get_machine(entry.machine_type, entry.duty_level)
            )
        else:
            machine = data_source.get_machine(entry.machine_type, entry.duty_level)
        emissions = machine.hourly_emission * entry.operating_hours
        total += emissions
        entry_results.append(
            {
                "machineType": machine.machine_type,
                "dutyLevel": machine.duty_level,
                "avgKW": machine.avg_kw,
                "hourlyEmission": machine.hourly_emission,
                "countryCode": machine.country_code,
                "gridFactor": machine.grid_factor,
                "gridYear": machine.grid_year,
                "gridSource": machine.grid_source,
                "dataSource": machine.data_source,
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
            "machining": "Machine hourly emissions are calculated from average kW and the latest SG grid factor.",
        },
    }
