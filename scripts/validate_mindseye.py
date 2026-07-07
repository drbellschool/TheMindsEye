#!/usr/bin/env python3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import (
    load_building_manifest,
    load_instructional_alignment_manifest,
    load_sanborn_asset_manifest,
    load_sanborn_image_metadata_manifest,
    load_sanborn_sheet_manifest,
    load_sanborn_sheet_review_manifest,
    load_sanborn_stitching_manifest,
    load_town_package,
    load_verification_suggestion_manifest,
)


def main():
    load_town_package(ROOT, "texarkana")
    load_sanborn_sheet_manifest(ROOT, "texarkana")
    load_sanborn_asset_manifest(ROOT, "texarkana")
    load_sanborn_image_metadata_manifest(ROOT, "texarkana")
    load_sanborn_sheet_review_manifest(ROOT, "texarkana")
    load_sanborn_stitching_manifest(ROOT, "texarkana")
    load_building_manifest(ROOT, "texarkana")
    load_instructional_alignment_manifest(ROOT, "texarkana")
    load_verification_suggestion_manifest(ROOT, "texarkana")
    print("Mind's Eye validation passed.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Mind's Eye validation failed: {exc}", file=sys.stderr)
        sys.exit(1)
