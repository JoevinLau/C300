#!/usr/bin/env python3
import sys
import json
from pathlib import Path

# Ensure project root is on sys.path so imports like `from calculation.engine import ...` work
_ROOT = Path(__file__).resolve().parent
project_root = _ROOT.parent
import sys as _sys
if str(project_root) not in _sys.path:
    _sys.path.insert(0, str(project_root))

try:
    # api package exposes calculator which delegates to calculation.engine
    from calculator import compute_emissions
except Exception as e:
    try:
        # fallback
        from api.calculator import compute_emissions
    except Exception:
        print(json.dumps({"error": f"Failed to import compute_emissions: {e}"}))
        _sys.exit(2)

def main():
    try:
        payload = json.load(sys.stdin)
    except Exception as exc:
        print(json.dumps({"error": f"Invalid JSON input: {exc}"}))
        sys.exit(2)

    try:
        result = compute_emissions(payload)
        json.dump(result, sys.stdout)
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)

if __name__ == '__main__':
    main()
