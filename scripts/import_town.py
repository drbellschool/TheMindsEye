#!/usr/bin/env python3
"""Import the Texarkana town-package JSON into PostgreSQL."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from mindseye.db.importer import build_import_plan
from mindseye.db.postgres import import_plan


def main() -> int:
    parser = argparse.ArgumentParser(description="Import town-package JSON into PostgreSQL.")
    parser.add_argument(
        "--town-dir",
        default=str(ROOT / "data" / "towns" / "texarkana"),
        help="Path to a town package directory. Defaults to data/towns/texarkana.",
    )
    parser.add_argument(
        "--database-url",
        default=os.environ.get("DATABASE_URL"),
        help="PostgreSQL connection URL. Defaults to DATABASE_URL.",
    )
    parser.add_argument(
        "--apply-schema",
        action="store_true",
        help="Apply src/mindseye/db/schema.sql before importing.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Build and validate the import plan without connecting to PostgreSQL.",
    )
    args = parser.parse_args()

    plan = build_import_plan(args.town_dir)
    if args.dry_run:
        print(json.dumps(plan.summary(), indent=2, sort_keys=True))
        return 0

    if not args.database_url:
        print(
            "DATABASE_URL is required unless --dry-run is used. See .env.example.",
            file=sys.stderr,
        )
        return 2

    import_plan(args.database_url, plan, apply_schema=args.apply_schema)
    print(
        f"Imported {plan.package_id}: "
        f"{len(plan.source_records)} sources, "
        f"{len(plan.locations)} locations, "
        f"{len(plan.claims)} claims, "
        f"{len(plan.mission_seeds)} mission seeds."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
