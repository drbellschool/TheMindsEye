#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye.sanborn import build_sanborn_image_metadata_manifest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Export committed metadata for validated local Sanborn sheet images.")
    parser.add_argument("--town", default="texarkana", help="Town slug. Defaults to texarkana.")
    parser.add_argument("--captured-date", default=None, help="Optional YYYY-MM-DD capture date override.")
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Optional output path. Defaults to data/towns/<town>/sanborn_1885_image_metadata.json.",
    )
    args = parser.parse_args(argv)

    manifest = build_sanborn_image_metadata_manifest(ROOT, args.town, captured_date=args.captured_date)
    output_path = args.output or ROOT / "data" / "towns" / args.town / "sanborn_1885_image_metadata.json"
    output_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote Sanborn image metadata manifest to {output_path}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Sanborn image metadata export failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
