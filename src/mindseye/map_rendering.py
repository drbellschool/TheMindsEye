from __future__ import annotations

from pathlib import Path

from .building_data import load_building_manifest
from .models import ClaimType, MindseyeDataError, TownPackage
from .sanborn import load_sanborn_stitching_manifest
from .teacher_review import load_teacher_review_manifest


def build_map_rendering_packet(
    package: TownPackage,
    repo_root: Path | None = None,
    town_slug: str = "texarkana",
    state_root: Path | None = None,
) -> dict[str, object]:
    """Build a read-only rendering contract from existing package data.

    The packet separates historical base layers, structural map layers, art
    anchors, labels, runtime markers, and provenance. It does not invent
    geometry or render anything directly.
    """
    base_map_layer = _base_map_layer(package, repo_root, town_slug)
    road_rail_layer = _road_rail_layer(package)
    building_manifest = None
    try:
        building_manifest = load_building_manifest(repo_root, town_slug, state_root=state_root)
    except MindseyeDataError:
        pass
    building_footprint_layer, building_art_layer = _building_layers(
        package, building_manifest, repo_root, town_slug
    )
    label_layer = _label_layer(package)
    quest_marker_layer = _quest_marker_layer(package)
    evidence_layer = _evidence_layer(package, repo_root, town_slug)

    return {
        "town_package_id": package.package_id,
        "map_id": base_map_layer["map_id"],
        "render_contract_id": f"map_render_{package.package_id}",
        "base_map_layer": base_map_layer,
        "road_rail_layer": road_rail_layer,
        "building_footprint_layer": building_footprint_layer,
        "building_art_layer": building_art_layer,
        "label_layer": label_layer,
        "quest_marker_layer": quest_marker_layer,
        "evidence_provenance_layer": evidence_layer,
    }


def _base_map_layer(
    package: TownPackage,
    repo_root: Path | None,
    town_slug: str,
) -> dict[str, object]:
    primary_map_layer = package.map_layers[0]
    stitching_status = "not_loaded"
    georeferencing_status = "deferred"
    try:
        stitching_manifest = load_sanborn_stitching_manifest(repo_root, town_slug)
    except MindseyeDataError:
        stitching_manifest = None
    if stitching_manifest is not None and stitching_manifest.map_id == primary_map_layer["map_id"]:
        stitching_status = stitching_manifest.stitching_status
        georeferencing_status = stitching_manifest.georeferencing_status

    return {
        "layer_id": "base-map",
        "map_id": primary_map_layer["map_id"],
        "source_ids": list(primary_map_layer.get("source_ids", [])),
        "time_window": dict(package.time_window),
        "title": primary_map_layer.get("title", ""),
        "render_mode": "historical_base_surface",
        "stitching_status": stitching_status,
        "georeferencing_status": georeferencing_status,
    }


def _road_rail_layer(package: TownPackage) -> dict[str, object]:
    source_ids = list(package.source_ids)
    return {
        "layer_id": "road-rail",
        "status": "deferred",
        "route_count": 0,
        "routes": [],
        "notes": "Road and rail geometry is deferred until extraction is implemented.",
        "source_ids": source_ids,
    }


def _building_layers(
    package: TownPackage,
    building_manifest: object | None,
    repo_root: Path | None,
    town_slug: str,
) -> tuple[dict[str, object], dict[str, object]]:
    building_rows: list[dict[str, object]] = []
    art_rows: list[dict[str, object]] = []
    fallback_rows: list[dict[str, object]] = []

    reviewed_location_ids = {location.location_id for location in package.locations if location.certainty == "verified"}
    reviewed_building_ids = set()

    if building_manifest is not None:
        reviewed_building_ids = {
            building.building_id
            for building in building_manifest.buildings
            if building.identity_status == "reviewed" and building.review_record_id is not None
        }
        for building in building_manifest.buildings:
            review_anchor_kind = "building" if building.building_id in reviewed_building_ids else "location"
            review_anchor_id = building.building_id if review_anchor_kind == "building" else building.location_id
            review_anchor_status = (
                "reviewed_building_anchor"
                if review_anchor_kind == "building"
                else (
                    "reviewed_location_anchor"
                    if building.location_id in reviewed_location_ids
                    else "placeholder_location_seed"
                )
            )
            building_rows.append(
                {
                    "building_id": building.building_id,
                    "location_id": building.location_id,
                    "map_id": building.map_id,
                    "footprint_geometry": None,
                    "geometry_basis": building.identity_basis,
                    "footprint_status": "deferred",
                    "source_ids": list(building.source_ids),
                    "review_record_id": building.review_record_id,
                    "student_safe_name": building.student_safe_name,
                    "visual_detail_status": building.visual_detail_status,
                    "fallback_render_mode": building.default_render_mode,
                }
            )

            art_record = {
                "building_art_id": f"art_{building.building_id}_v1",
                "building_id": building.building_id,
                "location_id": building.location_id,
                "review_anchor_kind": review_anchor_kind,
                "review_anchor_id": review_anchor_id,
                "review_anchor_status": review_anchor_status,
                "review_anchor_reviewed": review_anchor_status != "placeholder_location_seed",
                "asset_path": None,
                "transparent_background": True,
                "visual_detail_status": building.visual_detail_status,
                "historical_basis": _historical_basis_for_art(building.visual_detail_status),
                "source_ids": list(building.source_ids),
                "review_status": building.identity_status,
                "fallback_render_mode": building.default_render_mode,
                "notes": building.notes,
            }
            if building.building_id in reviewed_building_ids:
                art_rows.append(art_record)
            else:
                fallback_rows.append(
                    {
                        **art_record,
                        "review_anchor_state": "placeholder_location",
                        "reviewed_anchor": False,
                    }
                )

    return (
        {
            "layer_id": "building-footprints",
            "status": "deferred",
            "records": building_rows,
            "reviewed_location_ids": sorted(reviewed_location_ids),
        },
        {
            "layer_id": "building-art",
            "status": "reviewed_subset_available" if art_rows else "deferred",
            "records": art_rows,
            "fallback_records": fallback_rows,
            "reviewed_building_ids": sorted(reviewed_building_ids),
        },
    )


def _label_layer(package: TownPackage) -> dict[str, object]:
    labels = []
    for location in package.locations:
        labels.append(
            {
                "label_id": f"label_{location.location_id}",
                "target_anchor_id": location.location_id,
                "label_text": location.label,
                "label_type": "location",
                "display_priority": "high" if location.certainty == "verified" else "normal",
                "source_ids": list(location.source_ids),
                "certainty": location.certainty,
            }
        )
    return {
        "layer_id": "labels",
        "status": "ready",
        "records": labels,
    }


def _quest_marker_layer(package: TownPackage) -> dict[str, object]:
    return {
        "layer_id": "quest-markers",
        "status": "draft",
        "records": [
            {
                "marker_id": f"marker_{package.mission_seed.mission_id}",
                "mission_id": package.mission_seed.mission_id,
                "target_anchor_ids": list(package.mission_seed.location_ids),
                "marker_type": "mission_seed",
                "display_state": "blocked_by_teacher_review",
                "student_visible": False,
                "teacher_visible": True,
                "source_ids": list(package.mission_seed.claim_ids),
            }
        ],
    }


def _evidence_layer(
    package: TownPackage,
    repo_root: Path | None,
    town_slug: str,
) -> dict[str, object]:
    teacher_review_manifest = load_teacher_review_manifest(repo_root, town_slug)
    provenance_records = []
    for claim in package.claims:
        provenance_records.append(
            {
                "evidence_id": f"evidence_{claim.claim_id}",
                "anchor_id": claim.claim_id,
                "anchor_type": "claim",
                "claim_type": claim.claim_type.value,
                "confidence": claim.confidence.value,
                "source_ids": list(claim.source_ids),
                "student_visible": claim.student_visible,
                "teacher_visible": claim.teacher_visible,
            }
        )

    return {
        "layer_id": "evidence-provenance",
        "status": "ready",
        "teacher_review_manifest_id": teacher_review_manifest.teacher_review_manifest_id,
        "records": provenance_records,
    }


def _historical_basis_for_art(visual_detail_status: str) -> str:
    if visual_detail_status == "verified":
        return ClaimType.VERIFIED_FACT.value
    if visual_detail_status == "inferred":
        return ClaimType.SOURCE_BASED_INFERENCE.value
    return ClaimType.FICTIONAL_GAMEPLAY.value
