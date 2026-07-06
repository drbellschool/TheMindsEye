from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .schema_validation import validate_json_schema


TOWN_FILE_SCHEMAS = {
    "metadata.json": "town-package.schema.json",
    "sources.json": "source.schema.json",
    "locations.json": "location.schema.json",
    "claims.json": "claim.schema.json",
    "mission_seed.json": "mission-seed.schema.json",
}


def load_json(path: Path) -> Any:
    if not path.exists():
        raise ValueError(f"missing required file: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def validate_town_package(town_dir: Path, schemas_dir: Path) -> None:
    """Validate one town package's schema shape and cross-file references."""
    schemas = {
        town_file: load_schema(schemas_dir / schema_file)
        for town_file, schema_file in TOWN_FILE_SCHEMAS.items()
    }
    data = {
        town_file: load_json(town_dir / town_file)
        for town_file in TOWN_FILE_SCHEMAS
    }

    for town_file, schema in schemas.items():
        validate_json_schema(data[town_file], schema, path=town_file)

    assert_town_package_links(
        metadata=data["metadata.json"],
        sources=data["sources.json"],
        locations=data["locations.json"],
        claims=data["claims.json"],
        mission=data["mission_seed.json"],
    )


def load_schema(path: Path) -> dict[str, Any]:
    schema = load_json(path)
    if not isinstance(schema, dict):
        raise ValueError(f"schema must be an object: {path.name}")
    for key in ("title", "type"):
        if key not in schema:
            raise ValueError(f"{path.name} missing {key}")
    return schema


def assert_town_package_links(
    *,
    metadata: dict[str, Any],
    sources: list[dict[str, Any]],
    locations: list[dict[str, Any]],
    claims: list[dict[str, Any]],
    mission: dict[str, Any],
) -> None:
    source_ids = collect_unique_ids(sources, "source_id", "source")

    if metadata["source_manifest"] != "sources.json":
        raise ValueError("metadata.source_manifest must be sources.json")

    map_ids = collect_unique_ids(metadata["map_layers"], "map_id", "map layer")
    for layer in metadata["map_layers"]:
        for source_id in layer["source_ids"]:
            if source_id not in source_ids:
                raise ValueError(f"map layer references missing source: {source_id}")

    location_ids = collect_unique_ids(locations, "location_id", "location")
    for location in locations:
        if location["map_id"] not in map_ids:
            raise ValueError(f"location {location['location_id']} references missing map: {location['map_id']}")
        for source_id in location["source_ids"]:
            if source_id not in source_ids:
                raise ValueError(f"location {location['location_id']} references missing source: {source_id}")

    claim_ids = collect_unique_ids(claims, "claim_id", "claim")
    for claim in claims:
        if claim["claim_type"] in {"verified_fact", "source_based_inference"}:
            if not claim["source_ids"]:
                raise ValueError(f"{claim['claim_id']} needs at least one source")
            if claim["confidence"] == "fictional":
                raise ValueError(f"{claim['claim_id']} cannot use fictional confidence")

        if claim["claim_type"] == "fictional_gameplay" and claim["confidence"] != "fictional":
            raise ValueError(f"{claim['claim_id']} must use fictional confidence")

        for source_id in claim["source_ids"]:
            if source_id not in source_ids:
                raise ValueError(f"claim {claim['claim_id']} references missing source: {source_id}")
        for location_id in claim.get("related_location_ids", []):
            if location_id not in location_ids:
                raise ValueError(f"claim {claim['claim_id']} references missing location: {location_id}")

    if mission["town_package_id"] != metadata["package_id"]:
        raise ValueError("mission town_package_id mismatch")
    for location_id in mission["location_ids"]:
        if location_id not in location_ids:
            raise ValueError(f"mission references missing location: {location_id}")
    for claim_id in mission["claim_ids"]:
        if claim_id not in claim_ids:
            raise ValueError(f"mission references missing claim: {claim_id}")


def collect_unique_ids(records: list[dict[str, Any]], key: str, label: str) -> set[str]:
    ids: set[str] = set()
    for record in records:
        record_id = record[key]
        if record_id in ids:
            raise ValueError(f"duplicate {label} id: {record_id}")
        ids.add(record_id)
    return ids
