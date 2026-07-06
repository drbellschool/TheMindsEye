from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .models import (
    ClaimRecord,
    LocationRecord,
    MindseyeDataError,
    MissionSeed,
    SourceRecord,
    TownPackage,
)
from .provenance import assert_provenance_integrity
from .town_validation import validate_town_package


def repo_root_from(start: Path | None = None) -> Path:
    """Return the repository root based on this file location or a supplied path."""
    if start is not None:
        return start.resolve()
    return Path(__file__).resolve().parents[2]


def load_json(path: Path) -> Any:
    if not path.exists():
        raise MindseyeDataError(f"missing required file: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def load_town_package(repo_root: Path | None = None, town_slug: str = "texarkana") -> TownPackage:
    """Load and validate one town package from the data/towns folder.

    This is intentionally deterministic. It does not call AI, scrape sources,
    infer facts, or mutate files. That makes it safe for Codex to build against.
    """
    root = repo_root_from(repo_root)
    town_dir = root / "data" / "towns" / town_slug
    schemas_dir = root / "data" / "schemas"

    try:
        validate_town_package(town_dir, schemas_dir)
    except ValueError as exc:
        raise MindseyeDataError(str(exc)) from exc

    metadata = load_json(town_dir / "metadata.json")
    raw_sources = load_json(town_dir / "sources.json")
    sources = tuple(SourceRecord.from_dict(item) for item in raw_sources)
    locations = tuple(LocationRecord.from_dict(item) for item in load_json(town_dir / "locations.json"))
    claims = tuple(ClaimRecord.from_dict(item) for item in load_json(town_dir / "claims.json"))
    mission_seed = MissionSeed.from_dict(load_json(town_dir / "mission_seed.json"))

    package = TownPackage(
        package_id=require_metadata_text(metadata, "package_id"),
        town_name=require_metadata_text(metadata, "town_name"),
        state_region=require_metadata_text(metadata, "state_region"),
        time_window=require_metadata_object(metadata, "time_window"),
        status=require_metadata_text(metadata, "status"),
        map_layers=tuple(require_metadata_list(metadata, "map_layers")),
        notes=str(metadata.get("notes", "")),
        sources=sources,
        locations=locations,
        claims=claims,
        mission_seed=mission_seed,
        raw_source_records=tuple(dict(item) for item in raw_sources),
    )

    assert_package_links(package)
    assert_provenance_integrity(package)
    return package


def assert_package_links(package: TownPackage) -> None:
    if package.mission_seed.town_package_id != package.package_id:
        raise MindseyeDataError("mission_seed.town_package_id does not match package_id")

    for layer in package.map_layers:
        source_ids = layer.get("source_ids", [])
        if not source_ids:
            raise MindseyeDataError("map layer must reference at least one source")
        for source_id in source_ids:
            if source_id not in package.source_ids:
                raise MindseyeDataError(f"map layer references missing source: {source_id}")

    for location in package.locations:
        for source_id in location.source_ids:
            if source_id not in package.source_ids:
                raise MindseyeDataError(f"location {location.location_id} references missing source: {source_id}")

    for location_id in package.mission_seed.location_ids:
        if location_id not in package.location_ids:
            raise MindseyeDataError(f"mission references missing location: {location_id}")

    for claim_id in package.mission_seed.claim_ids:
        if claim_id not in package.claim_ids:
            raise MindseyeDataError(f"mission references missing claim: {claim_id}")


def require_metadata_text(metadata: dict[str, Any], key: str) -> str:
    value = metadata.get(key)
    if not isinstance(value, str) or not value.strip():
        raise MindseyeDataError(f"metadata missing required text field: {key}")
    return value


def require_metadata_object(metadata: dict[str, Any], key: str) -> dict[str, Any]:
    value = metadata.get(key)
    if not isinstance(value, dict):
        raise MindseyeDataError(f"metadata missing required object field: {key}")
    return value


def require_metadata_list(metadata: dict[str, Any], key: str) -> list[Any]:
    value = metadata.get(key)
    if not isinstance(value, list) or not value:
        raise MindseyeDataError(f"metadata missing required list field: {key}")
    return value
