#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye.sanborn import build_sanborn_image_intake_report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate local Texarkana Sanborn image intake files.")
    parser.add_argument("--town", default="texarkana", help="Town slug. Defaults to texarkana.")
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=None,
        help="Optional local cache directory. Defaults to data/towns/<town>/local_cache/sanborn_1885.",
    )
    parser.add_argument("--json", action="store_true", help="Print the full report as JSON.")
    args = parser.parse_args(argv)

    report = build_sanborn_image_intake_report(ROOT, args.town, args.cache_dir)
    if args.json:
        print(json.dumps(report, indent=2))
        return 0

    present = report["present_files"]
    missing = report["missing_sheet_ids"]
    expected = report["expected_files"]
    if not isinstance(present, list) or not isinstance(missing, list) or not isinstance(expected, list):
        raise TypeError("Sanborn intake report returned invalid list fields")

    print(f"Sanborn image cache: {report['cache_dir']}")
    print(f"Expected sheet images: {len(expected)}")
    print(f"Present sheet images: {len(present)}")
    if missing:
        print("Missing sheet IDs:")
        for sheet_id in missing:
            print(f"- {sheet_id}")
    else:
        print("All expected sheet images are present.")
    print("Stitching/georeferencing/location extraction remain deferred.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Sanborn image intake validation failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
