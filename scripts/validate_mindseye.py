#!/usr/bin/env python3
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOWN = ROOT / "data" / "towns" / "texarkana"
SCHEMAS = ROOT / "data" / "schemas"


def load(path):
    if not path.exists():
        raise ValueError(f"missing {path.relative_to(ROOT)}")
    return json.loads(path.read_text(encoding="utf-8"))


def require(obj, keys, label):
    missing = [k for k in keys if k not in obj]
    if missing:
        raise ValueError(f"{label} missing {missing}")


def main():
    for name in [
        "town-package.schema.json",
        "source.schema.json",
        "claim.schema.json",
        "mission-seed.schema.json",
    ]:
        schema = load(SCHEMAS / name)
        require(schema, ["title"], name)

    sources = load(TOWN / "sources.json")
    metadata = load(TOWN / "metadata.json")
    locations = load(TOWN / "locations.json")
    claims = load(TOWN / "claims.json")
    mission = load(TOWN / "mission_seed.json")

    source_ids = set()
    for s in sources:
        require(s, ["source_id", "title", "source_type", "citation", "rights_status", "access_level"], "source")
        source_ids.add(s["source_id"])

    require(metadata, ["package_id", "town_name", "time_window", "source_manifest", "map_layers", "status"], "metadata")
    if metadata["source_manifest"] != "sources.json":
        raise ValueError("metadata.source_manifest must be sources.json")
    for layer in metadata["map_layers"]:
        require(layer, ["map_id", "source_ids"], "map layer")
        for sid in layer["source_ids"]:
            if sid not in source_ids:
                raise ValueError(f"map layer references missing source {sid}")

    location_ids = set()
    for loc in locations:
        require(loc, ["location_id", "map_id", "label", "source_ids"], "location")
        location_ids.add(loc["location_id"])
        for sid in loc["source_ids"]:
            if sid not in source_ids:
                raise ValueError(f"location references missing source {sid}")

    claim_ids = set()
    allowed_types = {"verified_fact", "source_based_inference", "fictional_gameplay"}
    for c in claims:
        require(c, ["claim_id", "claim_text", "claim_type", "confidence", "source_ids", "reasoning_note"], "claim")
        claim_ids.add(c["claim_id"])
        if c["claim_type"] not in allowed_types:
            raise ValueError(f"invalid claim_type {c['claim_type']}")
        if c["claim_type"] in {"verified_fact", "source_based_inference"} and not c["source_ids"]:
            raise ValueError(f"{c['claim_id']} needs at least one source")
        if c["claim_type"] == "fictional_gameplay" and c["confidence"] != "fictional":
            raise ValueError(f"{c['claim_id']} must use fictional confidence")
        for sid in c["source_ids"]:
            if sid not in source_ids:
                raise ValueError(f"claim references missing source {sid}")
        for lid in c.get("related_location_ids", []):
            if lid not in location_ids:
                raise ValueError(f"claim references missing location {lid}")

    require(mission, ["mission_id", "town_package_id", "location_ids", "claim_ids", "student_hook", "teacher_notes"], "mission")
    if mission["town_package_id"] != metadata["package_id"]:
        raise ValueError("mission town_package_id mismatch")
    for lid in mission["location_ids"]:
        if lid not in location_ids:
            raise ValueError(f"mission references missing location {lid}")
    for cid in mission["claim_ids"]:
        if cid not in claim_ids:
            raise ValueError(f"mission references missing claim {cid}")

    print("Mind's Eye validation passed.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Mind's Eye validation failed: {exc}", file=sys.stderr)
        sys.exit(1)
