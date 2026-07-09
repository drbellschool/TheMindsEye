from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ..building_data import load_building_manifest
from ..community_review import load_community_review_manifest
from ..models import MindseyeDataError
from ..town_loader import load_json, load_town_package, repo_root_from
from .contracts import AssetGenerationQueue, queue_to_dict, validate_asset_generation_queue, validate_known_record_reference

ASSET_GENERATION_QUEUE_FILENAME = "asset_generation_queue.json"


def load_asset_generation_queue(
    repo_root: Path | None = None,
    town_slug: str = "texarkana",
    filename: str = ASSET_GENERATION_QUEUE_FILENAME,
) -> AssetGenerationQueue:
    root = repo_root_from(repo_root)
    queue_path = root / "data" / "towns" / town_slug / filename
    raw_queue = load_json(queue_path)
    if not isinstance(raw_queue, dict):
        raise MindseyeDataError("asset generation queue must be a JSON object")

    queue = AssetGenerationQueue.from_dict(raw_queue)
    validate_asset_generation_queue(queue)
    _assert_asset_generation_queue_links(queue, root, town_slug)
    return queue


def build_asset_generation_queue_packet(queue: AssetGenerationQueue) -> dict[str, Any]:
    payload = queue_to_dict(queue)
    payload["request_ids"] = [request.request_id for request in queue.requests]
    return payload


def write_asset_generation_queue_snapshot(
    queue: AssetGenerationQueue,
    repo_root: Path | None = None,
    town_slug: str = "texarkana",
    filename: str | None = None,
) -> Path:
    root = repo_root_from(repo_root)
    target_dir = root / "data" / "normalized" / "ai"
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / (filename or f"{town_slug}_asset_generation_queue.json")
    target.write_text(json.dumps(queue_to_dict(queue), indent=2, sort_keys=True), encoding="utf-8")
    return target


def _assert_asset_generation_queue_links(queue: AssetGenerationQueue, root: Path, town_slug: str) -> None:
    package = load_town_package(root, town_slug)
    building_manifest = load_building_manifest(root, town_slug)
    community_review = load_community_review_manifest(root, town_slug)

    known_record_ids_by_type = {
        "building": {building.building_id for building in building_manifest.buildings},
        "location": set(package.location_ids),
        "person": {record.entity_id for record in community_review.people},
        "business": {record.entity_id for record in community_review.businesses},
        "source": set(package.source_ids),
    }

    for request in queue.requests:
        validate_known_record_reference(request, known_record_ids_by_type)
