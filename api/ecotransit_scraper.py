import os
import re
from pathlib import Path
from typing import Any


ECOTRANSIT_CALCULATOR_URL = "https://emissioncalculator.ecotransit.world/"

AIRPORT_SEARCH_OVERRIDES = {
    "port of shanghai": "Shanghai Pudong",
    "shanghai": "Shanghai Pudong",
    "singapore": "Singapore Changi",
    "port of tuas": "Singapore Changi",
    "port of tuas / singapore": "Singapore Changi",
}


def _local_chromium_executable() -> Path | None:
    roots: list[Path] = []
    browsers_path = os.getenv("PLAYWRIGHT_BROWSERS_PATH")
    if browsers_path:
        roots.append(Path(browsers_path))
    roots.append(Path(__file__).resolve().parent.parent / ".playwright-browsers")

    for root in roots:
        if not root.exists():
            continue
        candidates = sorted(root.glob("chromium-*/chrome-win64/chrome.exe"), reverse=True)
        if candidates:
            return candidates[0]
    return None


def _to_float(value: str) -> float | None:
    cleaned = (
        value.replace("\u202f", "")
        .replace("\xa0", "")
        .replace(" ", "")
        .replace(",", "")
        .strip()
    )
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def _first_number(patterns: list[str], text: str) -> float | None:
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE | re.MULTILINE)
        if match:
            parsed = _to_float(match.group(1))
            if parsed is not None:
                return parsed
    return None


def _click_if_visible(page: Any, selector: str, timeout: int = 1500) -> None:
    try:
        page.locator(selector).first.click(timeout=timeout)
    except Exception:
        pass


def _visible_location_input(page: Any, location_index: int) -> Any:
    page.wait_for_load_state("domcontentloaded")

    location_inputs = page.locator("input[placeholder='Location']")
    try:
        location_inputs.nth(location_index).wait_for(state="visible", timeout=12000)
        return location_inputs.nth(location_index)
    except Exception:
        pass

    if location_index > 0:
        _click_if_visible(page, "#create-section-button", timeout=3000)
        try:
            location_inputs.nth(location_index).wait_for(state="visible", timeout=12000)
            return location_inputs.nth(location_index)
        except Exception:
            pass

    field = page.locator(f"#location-field-{location_index} input[slot='input']")
    try:
        field.wait_for(state="visible", timeout=12000)
        return field
    except Exception as exc:
        count = location_inputs.count()
        raise RuntimeError(
            f"EcoTransit location field {location_index + 1} was not available. "
            f"Found {count} location field(s) on the page."
        ) from exc


def _location_search_text(value: str, transport_mode: str = "sea") -> str:
    cleaned = value.strip()
    if transport_mode.lower().strip() == "air":
        override = AIRPORT_SEARCH_OVERRIDES.get(cleaned.lower())
        if override:
            return override

    cleaned = re.sub(r"^port\s+of\s+", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.split(r"\s*/\s*|\s*\(", cleaned, maxsplit=1)[0].strip()
    return cleaned or value.strip()


def _select_location(page: Any, input_index: int, text: str, transport_mode: str = "sea") -> None:
    search_text = _location_search_text(text, transport_mode)
    location_index = 0 if input_index <= 1 else 1

    location_input = _visible_location_input(page, location_index)
    location_input.click(timeout=15000)
    location_input.fill("")
    location_input.press_sequentially(search_text, delay=80)
    page.wait_for_timeout(3000)

    cells = page.locator("vaadin-grid-cell-content")
    try:
        cells.first.wait_for(timeout=8000)
    except Exception as exc:
        raise RuntimeError(f"EcoTransit did not show location results for '{text}'.") from exc

    rows: list[tuple[int, list[str]]] = []
    cell_count = cells.count()
    for row_start in range(0, cell_count, 5):
        row = []
        for offset in range(5):
            index = row_start + offset
            if index >= cell_count:
                row.append("")
            else:
                row.append(cells.nth(index).inner_text(timeout=500).strip())
        if any(row):
            rows.append((row_start, row))

    if transport_mode.lower().strip() == "air":
        type_priority = ("IATACode", "City", "LoCode", "UICCode", "ZIP")
    else:
        type_priority = ("LoCode", "City", "IATACode", "UICCode", "ZIP")
    for preferred_type in type_priority:
        for row_start, row in rows:
            if len(row) >= 4 and row[2] == preferred_type:
                if search_text.lower() in row[1].lower() or row[1].lower() in search_text.lower():
                    cells.nth(row_start + 1).click(timeout=5000)
                    page.wait_for_timeout(800)
                    return

    for row_start, row in rows:
        if len(row) >= 2 and row[1]:
            cells.nth(row_start + 1).click(timeout=5000)
            page.wait_for_timeout(800)
            return

    raise RuntimeError(f"Could not select EcoTransit location result for '{text}'.")


def _choose_transport_mode(page: Any, transport_mode: str) -> None:
    mode = transport_mode.lower().strip()
    selectors = {
        "sea": "#transport-type-button-ship-0",
        "vessel": "#transport-type-button-ship-0",
        "ship": "#transport-type-button-ship-0",
        "air": "#transport-type-button-air-0",
        "land": "#transport-type-button-road-0",
        "truck": "#transport-type-button-road-0",
        "rail": "#transport-type-button-train-0",
    }
    selector = selectors.get(mode)
    if selector:
        _click_if_visible(page, selector)


def _click_calculate(page: Any) -> None:
    for selector in ("#calculation-button", "vaadin-button:has-text('Calculate')", "text=Calculate"):
        try:
            page.locator(selector).first.click(timeout=10000)
            return
        except Exception:
            pass

    page.get_by_role("button", name=re.compile("calculate", re.IGNORECASE)).click(timeout=10000)


def _parse_result_text(text: str) -> dict[str, float | None]:
    distance_km = _first_number(
        [
            r"([\d\s.,]+)\s*km\s*[\r\n]+\s*[\d\s.,]+\s*tonne-km",
            r"Distance\s*(?:\[[^\]]+\])?\s*([\d\s.,]+)",
        ],
        text,
    )
    co2e_kg = _first_number(
        [
            r"CO(?:2|₂)e\s*\[kg\]\s*([\d\s.,]+)",
            r"CO(?:2|₂)\s*equivalent\s*\[kg\]\s*([\d\s.,]+)",
            r"GHG\s*emissions\s*\[kg\]\s*([\d\s.,]+)",
        ],
        text,
    )
    energy_mj = _first_number(
        [
            r"Primary\s+Energy\s*\[MJ\]\s*([\d\s.,]+)",
            r"Energy\s*\[MJ\]\s*([\d\s.,]+)",
        ],
        text,
    )

    return {
        "distance_km": distance_km,
        "co2e_kg": co2e_kg,
        "energy_mj": energy_mj,
    }


def calculate_ecotransit(
    port_of_loading: str,
    weight_kg: float,
    port_of_discharge: str = "Singapore",
    transport_mode: str = "sea",
) -> dict[str, float | None]:
    if not port_of_loading.strip():
        raise ValueError("port_of_loading is required")
    if not port_of_discharge.strip():
        raise ValueError("port_of_discharge is required")
    if weight_kg <= 0:
        raise ValueError("weight_kg must be greater than 0")

    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise RuntimeError(
            "Playwright is not installed. Install it with `python -m pip install playwright` "
            "and then run `python -m playwright install chromium`."
        ) from exc

    weight_tonnes = weight_kg / 1000

    with sync_playwright() as playwright:
        launch_options: dict[str, Any] = {"headless": True}
        executable_path = _local_chromium_executable()
        if executable_path:
            launch_options["executable_path"] = str(executable_path)
        try:
            browser = playwright.chromium.launch(**launch_options)
        except Exception as exc:
            raise RuntimeError(
                "Playwright Chromium is not installed or could not start. "
                "Run `python -m playwright install chromium`, then retry. "
                f"Original error: {exc}"
            ) from exc
        page = browser.new_page()

        try:
            page.goto(ECOTRANSIT_CALCULATOR_URL, wait_until="domcontentloaded", timeout=45000)
            page.locator("input").first.wait_for(timeout=30000)

            try:
                page.get_by_text("Got it!").click(timeout=3000)
            except Exception:
                pass

            page.locator("input").first.fill(str(weight_tonnes))

            _select_location(page, 1, port_of_loading, transport_mode)

            _choose_transport_mode(page, transport_mode)

            _select_location(page, 2, port_of_discharge, transport_mode)

            _click_calculate(page)
            page.wait_for_timeout(10000)

            result = _parse_result_text(page.locator("body").inner_text())
            if all(value is None for value in result.values()):
                raise RuntimeError("EcoTransit calculation completed but no result values were found.")
            return result
        finally:
            browser.close()
