from __future__ import annotations

import sys
from pathlib import Path


API_DIR = Path(__file__).resolve().parents[1] / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from ecotransit_scraper import calculate_ecotransit


def main() -> None:
    result = calculate_ecotransit(
        port_of_loading="Shanghai",
        weight_kg=1000,
    )
    print(result)


if __name__ == "__main__":
    main()
