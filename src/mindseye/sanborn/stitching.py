from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any

from ..models import MindseyeDataError
from ..town_loader import load_json, repo_root_from
from .georeference import (
    build_sanborn_georeference_workspace,
    load_sanborn_control_point_manifest,
    load_sanborn_layer_stack_manifest,
    load_sanborn_sheet_transform_manifest,
)

SHEET_MANIFEST_FILENAME = "sanborn_1885_sheet_manifest.json"
SHEET_REVIEW_FILENAME = "sanborn_1885_sheet_review.json"
STITCHING_MANIFEST_FILENAME = "sanborn_1885_stitching_manifest.json"


def build_sanborn_composite_manifest(
    repo_root: Path | None = None,
    town_slug: str = "texarkana",
    prepared_on: str | None = None,
) -> dict[str, Any]:
    root = repo_root_from(repo_root)
    sheet_manifest = _load_json_object(root / "data" / "towns" / town_slug / SHEET_MANIFEST_FILENAME, "sanborn sheet manifest")
    review_manifest = _load_json_object(root / "data" / "towns" / town_slug / SHEET_REVIEW_FILENAME, "sanborn sheet review manifest")
    stitching_manifest = _load_json_object(root / "data" / "towns" / town_slug / STITCHING_MANIFEST_FILENAME, "sanborn stitching manifest")

    georeference_workspace = build_sanborn_georeference_workspace(root, town_slug)
    control_point_manifest = load_sanborn_control_point_manifest(root, town_slug)
    sheet_transform_manifest = load_sanborn_sheet_transform_manifest(root, town_slug)
    layer_stack_manifest = load_sanborn_layer_stack_manifest(root, town_slug)

    if sheet_manifest["manifest_id"] != control_point_manifest["sheet_manifest_id"]:
        raise MindseyeDataError("sanborn composite manifest sheet_manifest_id mismatch")
    if review_manifest["sheet_review_manifest_id"] != control_point_manifest["sheet_review_manifest_id"]:
        raise MindseyeDataError("sanborn composite manifest sheet_review_manifest_id mismatch")
    if stitching_manifest["sheet_review_manifest_id"] != control_point_manifest["sheet_review_manifest_id"]:
        raise MindseyeDataError("sanborn composite manifest stitching manifest review linkage mismatch")
    if sheet_transform_manifest["sheet_review_manifest_id"] != review_manifest["sheet_review_manifest_id"]:
        raise MindseyeDataError("sanborn composite manifest sheet transform review linkage mismatch")
    if layer_stack_manifest["sheet_transform_manifest_id"] != sheet_transform_manifest["sheet_transform_manifest_id"]:
        raise MindseyeDataError("sanborn composite manifest layer stack linkage mismatch")

    review_sheets = _sheet_review_records(review_manifest)
    sheet_statuses = _composite_sheet_statuses(review_sheets, sheet_transform_manifest, control_point_manifest)
    warnings = _dedupe_preserve_order(
        list(stitching_manifest.get("runtime_notes", []))
        + list(control_point_manifest.get("warnings", []))
        + list(sheet_transform_manifest.get("warnings", []))
        + list(georeference_workspace.get("warnings", []))
    )
    blockers = _composite_blockers(
        control_point_manifest,
        sheet_transform_manifest,
        georeference_workspace,
    )

    prepared = prepared_on or date.today().isoformat()
    return {
        "composite_manifest_id": "sanborn_texarkana_1885_loc_composite_manifest",
        "manifest_type": "loc_sanborn_composite_manifest",
        "town_package_id": sheet_manifest["town_package_id"],
        "map_id": sheet_manifest["map_id"],
        "source_id": sheet_manifest["source_id"],
        "sheet_manifest_id": sheet_manifest["manifest_id"],
        "sheet_review_manifest_id": review_manifest["sheet_review_manifest_id"],
        "stitching_manifest_id": stitching_manifest["stitching_manifest_id"],
        "control_point_manifest_id": control_point_manifest["control_point_manifest_id"],
        "sheet_transform_manifest_id": sheet_transform_manifest["sheet_transform_manifest_id"],
        "layer_stack_manifest_id": layer_stack_manifest["layer_stack_manifest_id"],
        "prepared_on": prepared,
        "composite_status": "prep_only",
        "stitching_status": stitching_manifest["stitching_status"],
        "control_point_status": georeference_workspace["control_point_status"],
        "transform_status": georeference_workspace["transform_status"],
        "local_alignment_status": georeference_workspace["local_alignment_status"],
        "georeferencing_status": stitching_manifest["georeferencing_status"],
        "location_extraction_status": stitching_manifest["location_extraction_status"],
        "claim_generation_status": stitching_manifest["claim_generation_status"],
        "anchor_sheet_id": stitching_manifest["anchor_sheet_id"],
        "coordinate_system": georeference_workspace["coordinate_system"],
        "sheet_plan_count": stitching_manifest["sheet_plan_count"],
        "sheet_review_count": len(review_sheets),
        "control_point_count": control_point_manifest["control_point_count"],
        "transform_sheet_count": sheet_transform_manifest["sheet_transform_count"],
        "layer_count": layer_stack_manifest["layer_count"],
        "sheet_statuses": sheet_statuses,
        "control_point_manifest": control_point_manifest,
        "sheet_transform_manifest": sheet_transform_manifest,
        "layer_stack_manifest": layer_stack_manifest,
        "georeference_workspace": georeference_workspace,
        "warnings": warnings,
        "warning_count": len(warnings),
        "blockers": blockers,
        "blocker_count": len(blockers),
        "missing_control_point_sheet_ids": georeference_workspace["missing_control_point_sheet_ids"],
        "release_gate_status": "blocked" if blockers else "guarded",
        "release_gate_reason": (
            "Local alignment is still provisional and one or more sheets still lack control points."
            if blockers
            else "Local alignment has no blocking issues, but it is still prep-only."
        ),
        "notes": "Composite map manifest is prep-only and does not create final georeferencing.",
    }


def _composite_sheet_statuses(
    review_sheets: list[dict[str, Any]],
    sheet_transform_manifest: dict[str, Any],
    control_point_manifest: dict[str, Any],
) -> list[dict[str, Any]]:
    transforms_by_sheet_id = {transform["sheet_id"]: transform for transform in sheet_transform_manifest["sheet_transforms"]}
    control_points_by_sheet_id = _control_points_by_sheet_id(control_point_manifest)
    sheet_statuses: list[dict[str, Any]] = []

    for review in review_sheets:
        sheet_id = review["sheet_id"]
        transform = transforms_by_sheet_id.get(sheet_id)
        control_point_count = len(control_points_by_sheet_id.get(sheet_id, []))
        status = str(transform["transform_status"]) if transform is not None else "missing_control_points"
        warnings = list(transform.get("warnings", [])) if transform is not None else []
        if not control_point_count:
            warnings.append("No control points recorded yet.")
        if status == "local_anchor_only":
            warnings.append("Local anchor only; not final georeferencing.")

        sheet_statuses.append(
            {
                "sheet_id": sheet_id,
                "sheet_number": review["sheet_number"],
                "sheet_role": review["sheet_role"],
                "review_status": review["review_status"],
                "control_point_count": control_point_count,
                "transform_status": status,
                "warnings": _dedupe_preserve_order(warnings),
                "notes": review.get("notes", ""),
            }
        )

    return sheet_statuses


def _composite_blockers(
    control_point_manifest: dict[str, Any],
    sheet_transform_manifest: dict[str, Any],
    georeference_workspace: dict[str, Any],
) -> list[str]:
    blockers: list[str] = []
    if control_point_manifest["missing_control_point_sheet_ids"]:
        blockers.append(
            "Missing control points remain for sheets: "
            + ", ".join(_sheet_suffix(sheet_id) for sheet_id in control_point_manifest["missing_control_point_sheet_ids"])
            + "."
        )
    if georeference_workspace["local_alignment_status"] != "local_only":
        blockers.append("Local alignment is not yet stable.")
    if sheet_transform_manifest["transform_coverage_percent"] < 100:
        blockers.append("Not all sheets have transforms yet.")
    blockers.append("Local alignment must not be treated as final georeferencing.")
    return _dedupe_preserve_order(blockers)


def _sheet_review_records(raw: dict[str, Any]) -> list[dict[str, Any]]:
    manifest = _require_dict(raw, "sanborn sheet review manifest")
    reviews = _require_object_list(manifest, "reviews", "sanborn sheet review manifest")
    records: list[dict[str, Any]] = []
    for review in reviews:
        record = _require_dict(review, "sanborn sheet review record")
        records.append(
            {
                "sheet_id": _require_text(record, "sheet_id", "sanborn sheet review record"),
                "sheet_number": _require_int(record, "sheet_number", "sanborn sheet review record"),
                "sheet_role": _require_text(record, "sheet_role", "sanborn sheet review record"),
                "review_status": _require_text(record, "review_status", "sanborn sheet review record"),
                "notes": _require_text(record, "notes", "sanborn sheet review record"),
            }
        )
    return records


def _control_points_by_sheet_id(manifest: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    by_sheet_id: dict[str, list[dict[str, Any]]] = {}
    for point in manifest["control_points"]:
        by_sheet_id.setdefault(point["sheet_id"], []).append(point)
    return by_sheet_id


def _load_json_object(path: Path, label: str) -> dict[str, Any]:
    raw = load_json(path)
    if not isinstance(raw, dict):
        raise MindseyeDataError(f"{label} must be a JSON object")
    return raw


def _require_dict(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise MindseyeDataError(f"{label} must be a JSON object")
    return value


def _require_object_list(raw: dict[str, Any], key: str, label: str) -> list[dict[str, Any]]:
    value = raw.get(key)
    if not isinstance(value, list) or not value:
        raise MindseyeDataError(f"{label} missing required object list: {key}")
    if any(not isinstance(item, dict) for item in value):
        raise MindseyeDataError(f"{label} contains invalid object in: {key}")
    return value


def _require_text(raw: dict[str, Any], key: str, label: str) -> str:
    value = raw.get(key)
    if not isinstance(value, str) or not value.strip():
        raise MindseyeDataError(f"{label} missing required text field: {key}")
    return value


def _require_int(raw: dict[str, Any], key: str, label: str) -> int:
    value = raw.get(key)
    if not isinstance(value, int) or isinstance(value, bool):
        raise MindseyeDataError(f"{label} missing required integer field: {key}")
    return value


def _sheet_suffix(sheet_id: str) -> str:
    return sheet_id.rsplit("_", 1)[-1]


def _dedupe_preserve_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result
