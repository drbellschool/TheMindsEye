"""Build a database import plan from town-package JSON files."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .models import ALLOWED_CLAIM_TYPES, ALLOWED_CONFIDENCE_LABELS, TableRow


@dataclass(frozen=True)
class TownImportPlan:
    """Normalized rows and relationships ready for PostgreSQL import."""

    town_package: TableRow
    source_records: list[TableRow]
    locations: list[TableRow]
    claims: list[TableRow]
    claim_sources: list[TableRow]
    claim_locations: list[TableRow]
    mission_seeds: list[TableRow]
    mission_claims: list[TableRow]
    mission_locations: list[TableRow]

    @property
    def package_id(self) -> str:
        return str(self.town_package.values["package_id"])

    def rows_for(self, table: str) -> list[TableRow]:
        return list(getattr(self, table))

    def summary(self) -> dict[str, int | str]:
        return {
            "package_id": self.package_id,
            "source_records": len(self.source_records),
            "locations": len(self.locations),
            "claims": len(self.claims),
            "claim_sources": len(self.claim_sources),
            "claim_locations": len(self.claim_locations),
            "mission_seeds": len(self.mission_seeds),
            "mission_claims": len(self.mission_claims),
            "mission_locations": len(self.mission_locations),
        }


def build_import_plan(town_dir: str | Path) -> TownImportPlan:
    town_path = Path(town_dir)
    metadata = _load_json(town_path / "metadata.json")
    sources = _load_json(town_path / "sources.json")
    locations = _load_json(town_path / "locations.json")
    claims = _load_json(town_path / "claims.json")
    missions = _load_json(town_path / "mission_seed.json")

    if isinstance(missions, dict):
        mission_records = [missions]
    elif isinstance(missions, list):
        mission_records = missions
    else:
        raise ValueError("mission_seed.json must contain an object or array")

    _validate_metadata(metadata)
    package_id = metadata["package_id"]

    source_ids = _collect_unique_ids(sources, "source_id", "source")
    location_ids = _collect_unique_ids(locations, "location_id", "location")
    claim_ids = _collect_unique_ids(claims, "claim_id", "claim")

    _validate_sources(sources)
    _validate_locations(locations, source_ids)
    _validate_claims(claims, source_ids, location_ids)
    _validate_missions(mission_records, package_id, claim_ids, location_ids)

    town_package = TableRow(
        table="town_packages",
        values={
            "package_id": package_id,
            "town_name": metadata["town_name"],
            "state_region": metadata["state_region"],
            "start_year": metadata["time_window"]["start_year"],
            "end_year": metadata["time_window"]["end_year"],
            "time_window_label": metadata["time_window"]["label"],
            "source_manifest": metadata["source_manifest"],
            "status": metadata["status"],
            "notes": metadata.get("notes"),
            "raw_record": metadata,
        },
    )

    source_rows = [
        TableRow(
            table="source_records",
            values={
                "source_id": source["source_id"],
                "town_package_id": package_id,
                "title": source["title"],
                "source_type": source["source_type"],
                "repository": source.get("repository"),
                "url": _none_if_blank(source.get("url")),
                "citation": source["citation"],
                "rights_status": source["rights_status"],
                "access_level": source["access_level"],
                "accessed_date": _none_if_blank(source.get("accessed_date")),
                "notes": source.get("notes"),
                "raw_record": source,
            },
        )
        for source in sources
    ]

    location_rows = [
        TableRow(
            table="locations",
            values={
                "location_id": location["location_id"],
                "town_package_id": package_id,
                "map_id": location["map_id"],
                "label": location["label"],
                "street": location.get("street"),
                "location_type": location.get("location_type"),
                "source_ids": list(location.get("source_ids", [])),
                "certainty": location.get("certainty"),
                "notes": location.get("notes"),
                "raw_record": location,
            },
        )
        for location in locations
    ]

    claim_rows = [
        TableRow(
            table="claims",
            values={
                "claim_id": claim["claim_id"],
                "town_package_id": package_id,
                "claim_text": claim["claim_text"],
                "claim_type": claim["claim_type"],
                "confidence": claim["confidence"],
                "reasoning_note": claim["reasoning_note"],
                "student_visible": bool(claim.get("student_visible", True)),
                "teacher_visible": bool(claim.get("teacher_visible", True)),
                "raw_record": claim,
            },
        )
        for claim in claims
    ]

    claim_source_rows = [
        TableRow(
            table="claim_sources",
            values={"claim_id": claim["claim_id"], "source_id": source_id},
        )
        for claim in claims
        for source_id in claim.get("source_ids", [])
    ]

    claim_location_rows = [
        TableRow(
            table="claim_locations",
            values={"claim_id": claim["claim_id"], "location_id": location_id},
        )
        for claim in claims
        for location_id in claim.get("related_location_ids", [])
    ]

    mission_rows = [
        TableRow(
            table="mission_seeds",
            values={
                "mission_id": mission["mission_id"],
                "town_package_id": mission["town_package_id"],
                "title": mission.get("title"),
                "teacher_goal": mission.get("teacher_goal"),
                "student_hook": mission["student_hook"],
                "teacher_notes": mission["teacher_notes"],
                "fictional_elements": list(mission.get("fictional_elements", [])),
                "raw_record": mission,
            },
        )
        for mission in mission_records
    ]

    mission_claim_rows = [
        TableRow(
            table="mission_claims",
            values={"mission_id": mission["mission_id"], "claim_id": claim_id},
        )
        for mission in mission_records
        for claim_id in mission.get("claim_ids", [])
    ]

    mission_location_rows = [
        TableRow(
            table="mission_locations",
            values={"mission_id": mission["mission_id"], "location_id": location_id},
        )
        for mission in mission_records
        for location_id in mission.get("location_ids", [])
    ]

    return TownImportPlan(
        town_package=town_package,
        source_records=source_rows,
        locations=location_rows,
        claims=claim_rows,
        claim_sources=claim_source_rows,
        claim_locations=claim_location_rows,
        mission_seeds=mission_rows,
        mission_claims=mission_claim_rows,
        mission_locations=mission_location_rows,
    )


def _load_json(path: Path) -> Any:
    if not path.exists():
        raise ValueError(f"missing town package file: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def _collect_unique_ids(records: list[dict[str, Any]], key: str, label: str) -> set[str]:
    ids: set[str] = set()
    for record in records:
        value = record.get(key)
        if not value:
            raise ValueError(f"{label} missing {key}")
        if value in ids:
            raise ValueError(f"duplicate {label} id: {value}")
        ids.add(value)
    return ids


def _validate_metadata(metadata: dict[str, Any]) -> None:
    required = {
        "package_id",
        "town_name",
        "state_region",
        "time_window",
        "source_manifest",
        "status",
    }
    _require_keys(metadata, required, "metadata")
    _require_keys(metadata["time_window"], {"start_year", "end_year", "label"}, "metadata.time_window")
    if metadata["source_manifest"] != "sources.json":
        raise ValueError("metadata.source_manifest must be sources.json")


def _validate_sources(sources: list[dict[str, Any]]) -> None:
    for source in sources:
        _require_keys(
            source,
            {
                "source_id",
                "title",
                "source_type",
                "citation",
                "rights_status",
                "access_level",
            },
            "source",
        )


def _validate_locations(locations: list[dict[str, Any]], source_ids: set[str]) -> None:
    for location in locations:
        _require_keys(location, {"location_id", "map_id", "label", "source_ids"}, "location")
        for source_id in location.get("source_ids", []):
            if source_id not in source_ids:
                raise ValueError(f"location references missing source: {source_id}")


def _validate_claims(
    claims: list[dict[str, Any]],
    source_ids: set[str],
    location_ids: set[str],
) -> None:
    for claim in claims:
        _require_keys(
            claim,
            {
                "claim_id",
                "claim_text",
                "claim_type",
                "confidence",
                "source_ids",
                "reasoning_note",
            },
            "claim",
        )
        claim_type = claim["claim_type"]
        confidence = claim["confidence"]
        if claim_type not in ALLOWED_CLAIM_TYPES:
            raise ValueError(f"invalid claim_type: {claim_type}")
        if confidence not in ALLOWED_CONFIDENCE_LABELS:
            raise ValueError(f"invalid confidence label: {confidence}")
        if claim_type == "fictional_gameplay":
            if confidence != "fictional":
                raise ValueError(f"{claim['claim_id']} fictional gameplay must use fictional confidence")
        elif confidence == "fictional":
            raise ValueError(f"{claim['claim_id']} historical claim cannot use fictional confidence")
        elif not claim.get("source_ids"):
            raise ValueError(f"{claim['claim_id']} needs at least one source")
        for source_id in claim.get("source_ids", []):
            if source_id not in source_ids:
                raise ValueError(f"claim references missing source: {source_id}")
        for location_id in claim.get("related_location_ids", []):
            if location_id not in location_ids:
                raise ValueError(f"claim references missing location: {location_id}")


def _validate_missions(
    missions: list[dict[str, Any]],
    package_id: str,
    claim_ids: set[str],
    location_ids: set[str],
) -> None:
    mission_ids: set[str] = set()
    for mission in missions:
        _require_keys(
            mission,
            {
                "mission_id",
                "town_package_id",
                "location_ids",
                "claim_ids",
                "student_hook",
                "teacher_notes",
            },
            "mission",
        )
        mission_id = mission["mission_id"]
        if mission_id in mission_ids:
            raise ValueError(f"duplicate mission id: {mission_id}")
        mission_ids.add(mission_id)
        if mission["town_package_id"] != package_id:
            raise ValueError("mission town_package_id mismatch")
        for claim_id in mission.get("claim_ids", []):
            if claim_id not in claim_ids:
                raise ValueError(f"mission references missing claim: {claim_id}")
        for location_id in mission.get("location_ids", []):
            if location_id not in location_ids:
                raise ValueError(f"mission references missing location: {location_id}")


def _require_keys(record: dict[str, Any], keys: set[str], label: str) -> None:
    missing = sorted(key for key in keys if key not in record)
    if missing:
        raise ValueError(f"{label} missing {missing}")


def _none_if_blank(value: Any) -> Any:
    if value == "":
        return None
    return value
