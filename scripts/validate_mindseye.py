#!/usr/bin/env python3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye.town_validation import validate_town_package

TOWN = ROOT / "data" / "towns" / "texarkana"
SCHEMAS = ROOT / "data" / "schemas"


def main():
    validate_town_package(TOWN, SCHEMAS)
    print("Mind's Eye validation passed.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Mind's Eye validation failed: {exc}", file=sys.stderr)
        sys.exit(1)
