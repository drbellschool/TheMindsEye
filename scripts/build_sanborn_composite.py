#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import build_sanborn_composite_manifest


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the prep-only Sanborn composite manifest.")
    parser.add_argument("--repo-root", default=str(ROOT), help="Repository root path.")
    parser.add_argument("--town-slug", default="texarkana", help="Town slug to build.")
    parser.add_argument("--output", help="Optional output path for the generated manifest.")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON output.")
    args = parser.parse_args()

    manifest = build_sanborn_composite_manifest(Path(args.repo_root), town_slug=args.town_slug)
    payload = json.dumps(manifest, indent=2 if args.pretty or args.output else None, sort_keys=True)

    if args.output:
        output_path = Path(args.output)
        output_path.write_text(payload + "\n", encoding="utf-8")
    else:
        sys.stdout.write(payload + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
