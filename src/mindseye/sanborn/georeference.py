from __future__ import annotations

from pathlib import Path
from typing import Any

from ..models import MindseyeDataError
from ..town_loader import load_json, repo_root_from

CONTROL_POINT_FILENAME = "sanborn_1885_control_points.json"
TRANSFORM_FILENAME = "sanborn_1885_sheet_transforms.json"
LAYER_STACK_FILENAME = "sanborn_1885_layer_stack.json"
SHEET_REVIEW_FILENAME = "sanborn_1885_sheet_review.json"
STITCHING_FILENAME = "sanborn_1885_stitching_manifest.json"

EXPECTED_LAYER_IDS = (
    "base-map",
    "road-rail",
    "building-footprint",
    "building-art",
    "label-layer",
    "quest-marker-layer",
    "evidence-provenance-layer",
)

ALLOWED_CONTROL_POINT_STATUSES = {
    "candidate",
    "local_anchor_only",
    "missing_control_points",
    "partial",
}

ALLOWED_TRANSFORM_STATUSES = {
    "missing_control_points",
    "local_anchor_only",
    "partial",
    "prep_only",
}

ALLOWED_LAYER_STATUSES = {
    "draft",
    "deferred",
    "prep_only",
    "ready",
    "reviewed_subset_available",
}


def load_sanborn_control_point_manifest(
    repo_root: Path | None = None,
    town_slug: str = "texarkana",
    filename: str = CONTROL_POINT_FILENAME,
) -> dict[str, Any]:
    root = repo_root_from(repo_root)
    manifest = _load_json_object(root / "data" / "towns" / town_slug / filename, "sanborn control point manifest")
    return _validate_control_point_manifest(manifest)


def load_sanborn_sheet_transform_manifest(
    repo_root: Path | None = None,
    town_slug: str = "texarkana",
    filename: str = TRANSFORM_FILENAME,
) -> dict[str, Any]:
    root = repo_root_from(repo_root)
    manifest = _load_json_object(root / "data" / "towns" / town_slug / filename, "sanborn sheet transform manifest")
    control_point_manifest = load_sanborn_control_point_manifest(root, town_slug)
    return _validate_sheet_transform_manifest(manifest, control_point_manifest)


def load_sanborn_layer_stack_manifest(
    repo_root: Path | None = None,
    town_slug: str = "texarkana",
    filename: str = LAYER_STACK_FILENAME,
) -> dict[str, Any]:
    root = repo_root_from(repo_root)
    manifest = _load_json_object(root / "data" / "towns" / town_slug / filename, "sanborn layer stack manifest")
    return _validate_layer_stack_manifest(manifest)


def build_sanborn_georeference_workspace(
    repo_root: Path | None = None,
    town_slug: str = "texarkana",
) -> dict[str, Any]:
    root = repo_root_from(repo_root)
    control_point_manifest = load_sanborn_control_point_manifest(root, town_slug)
    sheet_transform_manifest = load_sanborn_sheet_transform_manifest(root, town_slug)
    layer_stack_manifest = load_sanborn_layer_stack_manifest(root, town_slug)
    sheet_review_manifest = _load_json_object(
        root / "data" / "towns" / town_slug / SHEET_REVIEW_FILENAME,
        "sanborn sheet review manifest",
    )
    stitching_manifest = _load_json_object(
        root / "data" / "towns" / town_slug / STITCHING_FILENAME,
        "sanborn stitching manifest",
    )

    review_sheets = _sheet_review_records(sheet_review_manifest)
    review_sheet_ids = [sheet["sheet_id"] for sheet in review_sheets]
    transforms = list(sheet_transform_manifest["sheet_transforms"])
    transforms_by_sheet_id = {transform["sheet_id"]: transform for transform in transforms}
    control_points_by_sheet_id = _control_points_by_sheet_id(control_point_manifest)

    sheet_statuses: list[dict[str, Any]] = []
    warnings: list[str] = []
    missing_control_point_sheet_ids: list[str] = []

    for review in review_sheets:
        sheet_id = review["sheet_id"]
        transform = transforms_by_sheet_id.get(sheet_id)
        control_point_ids = list(transform.get("control_point_ids", [])) if transform is not None else []
        control_point_count = len(control_points_by_sheet_id.get(sheet_id, []))
        status = str(transform["transform_status"]) if transform is not None else "missing_control_points"
        sheet_warnings = list(transform.get("warnings", [])) if transform is not None else []
        if not control_point_count:
            missing_control_point_sheet_ids.append(sheet_id)
            sheet_warnings.append("No control points recorded yet.")
        elif status == "local_anchor_only":
            sheet_warnings.append("Local anchor only; not final georeferencing.")

        if not control_point_count or status == "missing_control_points":
            warnings.append(f"{sheet_id}: missing control points")

        sheet_statuses.append(
            {
                "sheet_id": sheet_id,
                "sheet_number": review["sheet_number"],
                "sheet_role": review["sheet_role"],
                "review_status": review["review_status"],
                "control_point_count": control_point_count,
                "transform_status": status,
                "control_point_ids": control_point_ids,
                "warnings": _dedupe_preserve_order(sheet_warnings),
                "notes": review.get("notes", ""),
            }
        )

    control_point_count = len(control_point_manifest["control_points"])
    covered_sheet_count = len(control_point_manifest["sheet_statuses"]) - len(missing_control_point_sheet_ids)
    control_point_sheet_count = len(control_points_by_sheet_id)
    if control_point_count == 0:
        workspace_control_point_status = "not_started"
    elif control_point_sheet_count < len(review_sheets):
        workspace_control_point_status = "partial"
    else:
        workspace_control_point_status = "complete"

    if len(missing_control_point_sheet_ids) == 0:
        workspace_transform_status = "complete"
    else:
        workspace_transform_status = "partial"

    return {
        "control_point_manifest_id": control_point_manifest["control_point_manifest_id"],
        "sheet_transform_manifest_id": sheet_transform_manifest["sheet_transform_manifest_id"],
        "layer_stack_manifest_id": layer_stack_manifest["layer_stack_manifest_id"],
        "stitching_manifest_id": stitching_manifest["stitching_manifest_id"],
        "coordinate_system": control_point_manifest["coordinate_system"],
        "control_point_manifest_status": control_point_manifest.get("status", "prep_only"),
        "sheet_transform_manifest_status": sheet_transform_manifest.get("status", "prep_only"),
        "control_point_status": workspace_control_point_status,
        "transform_status": workspace_transform_status,
        "local_alignment_status": sheet_transform_manifest.get("local_alignment_status", "local_only"),
        "georeferencing_status": sheet_transform_manifest.get("georeferencing_status", "deferred"),
        "alignment_scope": sheet_transform_manifest.get("alignment_scope", "local_coordinate_system_only"),
        "sheet_count": len(review_sheets),
        "control_point_count": control_point_count,
        "covered_sheet_count": covered_sheet_count,
        "missing_control_point_sheet_ids": missing_control_point_sheet_ids,
        "sheet_statuses": sheet_statuses,
        "warnings": _dedupe_preserve_order(
            list(control_point_manifest.get("warnings", []))
            + list(sheet_transform_manifest.get("warnings", []))
            + warnings
            + [f"{stitching_manifest['anchor_sheet_id']}: local anchor only; not final georeferencing."],
        ),
        "layer_stack": layer_stack_manifest,
        "control_points": control_point_manifest["control_points"],
        "sheet_transforms": sheet_transform_manifest["sheet_transforms"],
        "review_sheet_ids": review_sheet_ids,
        "notes": "Local alignment is prep-only and must not be treated as final georeferencing.",
    }


def _validate_control_point_manifest(raw: dict[str, Any]) -> dict[str, Any]:
    manifest = _require_dict(raw, "sanborn control point manifest")
    control_points = _require_object_list(manifest, "control_points", "sanborn control point manifest")
    sheet_statuses = _require_object_list(manifest, "sheet_statuses", "sanborn control point manifest")
    coordinate_system = _require_dict(manifest.get("coordinate_system"), "sanborn control point manifest coordinate_system")

    normalized_points: list[dict[str, Any]] = []
    seen_point_ids: set[str] = set()
    for point in control_points:
        normalized = _normalize_control_point(point)
        if normalized["control_point_id"] in seen_point_ids:
            raise MindseyeDataError(f"duplicate sanborn control point id: {normalized['control_point_id']}")
        seen_point_ids.add(normalized["control_point_id"])
        normalized_points.append(normalized)

    normalized_sheet_statuses: list[dict[str, Any]] = []
    seen_sheet_ids: set[str] = set()
    for status in sheet_statuses:
        normalized = _normalize_sheet_status(status, "sanborn control point sheet status")
        if normalized["sheet_id"] in seen_sheet_ids:
            raise MindseyeDataError(f"duplicate sanborn control point sheet status: {normalized['sheet_id']}")
        seen_sheet_ids.add(normalized["sheet_id"])
        normalized_sheet_statuses.append(normalized)

    if len(normalized_points) != _require_int(manifest, "control_point_count", "sanborn control point manifest"):
        raise MindseyeDataError("sanborn control point manifest control_point_count does not match control_points")
    if len(normalized_sheet_statuses) != _require_int(manifest, "sheet_count", "sanborn control point manifest"):
        raise MindseyeDataError("sanborn control point manifest sheet_count does not match sheet_statuses")

    return {
        "control_point_manifest_id": _require_text(manifest, "control_point_manifest_id", "sanborn control point manifest"),
        "manifest_type": _require_text(manifest, "manifest_type", "sanborn control point manifest"),
        "town_package_id": _require_text(manifest, "town_package_id", "sanborn control point manifest"),
        "map_id": _require_text(manifest, "map_id", "sanborn control point manifest"),
        "source_id": _require_text(manifest, "source_id", "sanborn control point manifest"),
        "sheet_manifest_id": _require_text(manifest, "sheet_manifest_id", "sanborn control point manifest"),
        "sheet_review_manifest_id": _require_text(manifest, "sheet_review_manifest_id", "sanborn control point manifest"),
        "stitching_manifest_id": _require_text(manifest, "stitching_manifest_id", "sanborn control point manifest"),
        "title": _require_text(manifest, "title", "sanborn control point manifest"),
        "prepared_on": _require_text(manifest, "prepared_on", "sanborn control point manifest"),
        "coordinate_system": {
            "coordinate_system_id": _require_text(coordinate_system, "coordinate_system_id", "sanborn control point manifest coordinate_system"),
            "status": _require_text(coordinate_system, "status", "sanborn control point manifest coordinate_system"),
            "origin_sheet_id": _require_text(coordinate_system, "origin_sheet_id", "sanborn control point manifest coordinate_system"),
            "origin_sheet_number": _require_int(coordinate_system, "origin_sheet_number", "sanborn control point manifest coordinate_system"),
            "origin_description": _require_text(coordinate_system, "origin_description", "sanborn control point manifest coordinate_system"),
            "units": _require_text(coordinate_system, "units", "sanborn control point manifest coordinate_system"),
            "latlon_status": _require_text(coordinate_system, "latlon_status", "sanborn control point manifest coordinate_system"),
            "final_georeferencing_status": _require_text(coordinate_system, "final_georeferencing_status", "sanborn control point manifest coordinate_system"),
            "notes": _require_text(coordinate_system, "notes", "sanborn control point manifest coordinate_system"),
        },
        "control_points": normalized_points,
        "sheet_statuses": normalized_sheet_statuses,
        "control_point_count": _require_int(manifest, "control_point_count", "sanborn control point manifest"),
        "sheet_count": _require_int(manifest, "sheet_count", "sanborn control point manifest"),
        "covered_sheet_count": _require_int(manifest, "covered_sheet_count", "sanborn control point manifest"),
        "missing_control_point_sheet_ids": _require_text_list(manifest, "missing_control_point_sheet_ids", "sanborn control point manifest"),
        "warnings": _require_text_list(manifest, "warnings", "sanborn control point manifest"),
        "errors": _require_text_list(manifest, "errors", "sanborn control point manifest"),
        "status": _require_text(manifest, "status", "sanborn control point manifest"),
    }


def _validate_sheet_transform_manifest(
    raw: dict[str, Any],
    control_point_manifest: dict[str, Any],
) -> dict[str, Any]:
    manifest = _require_dict(raw, "sanborn sheet transform manifest")
    sheet_transforms = _require_object_list(manifest, "sheet_transforms", "sanborn sheet transform manifest")
    control_points_by_id = {point["control_point_id"]: point for point in control_point_manifest["control_points"]}
    review_sheet_ids = [
        status["sheet_id"]
        for status in control_point_manifest["sheet_statuses"]
    ]

    normalized_transforms: list[dict[str, Any]] = []
    seen_sheet_ids: set[str] = set()
    for transform in sheet_transforms:
        normalized = _normalize_sheet_transform(transform, control_points_by_id)
        if normalized["sheet_id"] in seen_sheet_ids:
            raise MindseyeDataError(f"duplicate sanborn sheet transform: {normalized['sheet_id']}")
        seen_sheet_ids.add(normalized["sheet_id"])
        normalized_transforms.append(normalized)

    if len(normalized_transforms) != _require_int(manifest, "sheet_transform_count", "sanborn sheet transform manifest"):
        raise MindseyeDataError("sanborn sheet transform manifest sheet_transform_count does not match transforms")

    if [transform["sheet_id"] for transform in normalized_transforms] != review_sheet_ids:
        raise MindseyeDataError("sanborn sheet transform manifest must preserve sheet review order")

    missing_sheet_ids = _require_text_list(manifest, "missing_control_point_sheet_ids", "sanborn sheet transform manifest")
    if sorted(missing_sheet_ids) != sorted(control_point_manifest["missing_control_point_sheet_ids"]):
        raise MindseyeDataError("sanborn sheet transform manifest missing_control_point_sheet_ids mismatch")

    layer_stack_manifest_id = _require_text(manifest, "control_point_manifest_id", "sanborn sheet transform manifest")
    if layer_stack_manifest_id != control_point_manifest["control_point_manifest_id"]:
        raise MindseyeDataError("sanborn sheet transform manifest control_point_manifest_id mismatch")

    return {
        "sheet_transform_manifest_id": _require_text(manifest, "sheet_transform_manifest_id", "sanborn sheet transform manifest"),
        "manifest_type": _require_text(manifest, "manifest_type", "sanborn sheet transform manifest"),
        "town_package_id": _require_text(manifest, "town_package_id", "sanborn sheet transform manifest"),
        "map_id": _require_text(manifest, "map_id", "sanborn sheet transform manifest"),
        "source_id": _require_text(manifest, "source_id", "sanborn sheet transform manifest"),
        "sheet_manifest_id": _require_text(manifest, "sheet_manifest_id", "sanborn sheet transform manifest"),
        "sheet_review_manifest_id": _require_text(manifest, "sheet_review_manifest_id", "sanborn sheet transform manifest"),
        "control_point_manifest_id": layer_stack_manifest_id,
        "title": _require_text(manifest, "title", "sanborn sheet transform manifest"),
        "prepared_on": _require_text(manifest, "prepared_on", "sanborn sheet transform manifest"),
        "alignment_scope": _require_text(manifest, "alignment_scope", "sanborn sheet transform manifest"),
        "control_point_status": _require_text(manifest, "control_point_status", "sanborn sheet transform manifest"),
        "transform_status": _require_text(manifest, "transform_status", "sanborn sheet transform manifest"),
        "local_alignment_status": _require_text(manifest, "local_alignment_status", "sanborn sheet transform manifest"),
        "georeferencing_status": _require_text(manifest, "georeferencing_status", "sanborn sheet transform manifest"),
        "sheet_transform_count": _require_int(manifest, "sheet_transform_count", "sanborn sheet transform manifest"),
        "sheet_transforms": normalized_transforms,
        "control_point_covered_sheet_ids": _require_text_list(manifest, "control_point_covered_sheet_ids", "sanborn sheet transform manifest"),
        "missing_control_point_sheet_ids": missing_sheet_ids,
        "transform_coverage_percent": _require_int(manifest, "transform_coverage_percent", "sanborn sheet transform manifest"),
        "warnings": _require_text_list(manifest, "warnings", "sanborn sheet transform manifest"),
        "errors": _require_text_list(manifest, "errors", "sanborn sheet transform manifest"),
        "status": _require_text(manifest, "status", "sanborn sheet transform manifest"),
    }


def _validate_layer_stack_manifest(raw: dict[str, Any]) -> dict[str, Any]:
    manifest = _require_dict(raw, "sanborn layer stack manifest")
    layers = _require_object_list(manifest, "layers", "sanborn layer stack manifest")

    normalized_layers = [_normalize_layer(layer) for layer in layers]
    if [layer["layer_id"] for layer in normalized_layers] != list(EXPECTED_LAYER_IDS):
        raise MindseyeDataError("sanborn layer stack manifest layers must preserve the expected order")

    if len(normalized_layers) != _require_int(manifest, "layer_count", "sanborn layer stack manifest"):
        raise MindseyeDataError("sanborn layer stack manifest layer_count does not match layers")

    return {
        "layer_stack_manifest_id": _require_text(manifest, "layer_stack_manifest_id", "sanborn layer stack manifest"),
        "manifest_type": _require_text(manifest, "manifest_type", "sanborn layer stack manifest"),
        "town_package_id": _require_text(manifest, "town_package_id", "sanborn layer stack manifest"),
        "map_id": _require_text(manifest, "map_id", "sanborn layer stack manifest"),
        "source_id": _require_text(manifest, "source_id", "sanborn layer stack manifest"),
        "sheet_manifest_id": _require_text(manifest, "sheet_manifest_id", "sanborn layer stack manifest"),
        "sheet_review_manifest_id": _require_text(manifest, "sheet_review_manifest_id", "sanborn layer stack manifest"),
        "control_point_manifest_id": _require_text(manifest, "control_point_manifest_id", "sanborn layer stack manifest"),
        "sheet_transform_manifest_id": _require_text(manifest, "sheet_transform_manifest_id", "sanborn layer stack manifest"),
        "texture_requirements": _require_text_list(manifest, "texture_requirements", "sanborn layer stack manifest"),
        "asset_requirements": _require_text_list(manifest, "asset_requirements", "sanborn layer stack manifest"),
        "layers": normalized_layers,
        "layer_count": _require_int(manifest, "layer_count", "sanborn layer stack manifest"),
        "status": _require_text(manifest, "status", "sanborn layer stack manifest"),
        "warnings": _require_text_list(manifest, "warnings", "sanborn layer stack manifest"),
        "errors": _require_text_list(manifest, "errors", "sanborn layer stack manifest"),
    }


def _normalize_control_point(raw: dict[str, Any]) -> dict[str, Any]:
    point = _require_dict(raw, "sanborn control point")
    control_point_id = _require_text(point, "control_point_id", "sanborn control point")
    status = _require_text(point, "status", "sanborn control point")
    if status not in ALLOWED_CONTROL_POINT_STATUSES:
        raise MindseyeDataError(f"sanborn control point has unsupported status: {status}")
    return {
        "control_point_id": control_point_id,
        "label": _require_text(point, "label", "sanborn control point"),
        "sheet_id": _require_text(point, "sheet_id", "sanborn control point"),
        "sheet_number": _require_int(point, "sheet_number", "sanborn control point"),
        "status": status,
        "review_state": _require_text(point, "review_state", "sanborn control point"),
        "reference_type": _require_text(point, "reference_type", "sanborn control point"),
        "source_feature": _require_text(point, "source_feature", "sanborn control point"),
        "sheet_feature": _require_text(point, "sheet_feature", "sanborn control point"),
        "local_x": _require_number(point, "local_x", "sanborn control point"),
        "local_y": _require_number(point, "local_y", "sanborn control point"),
        "source_ids": _require_text_list(point, "source_ids", "sanborn control point"),
        "evidence_basis": _require_text(point, "evidence_basis", "sanborn control point"),
        "notes": _require_text(point, "notes", "sanborn control point"),
    }


def _normalize_sheet_status(raw: dict[str, Any], label: str) -> dict[str, Any]:
    status = _require_dict(raw, label)
    return {
        "sheet_id": _require_text(status, "sheet_id", label),
        "sheet_number": _require_int(status, "sheet_number", label),
        "status": _require_text(status, "status", label),
        "control_point_count": _require_int(status, "control_point_count", label),
        "warnings": _require_text_list(status, "warnings", label),
        "notes": _require_text(status, "notes", label),
    }


def _normalize_sheet_transform(raw: dict[str, Any], control_points_by_id: dict[str, dict[str, Any]]) -> dict[str, Any]:
    transform = _require_dict(raw, "sanborn sheet transform")
    control_point_ids = _require_text_list(transform, "control_point_ids", "sanborn sheet transform")
    transform_status = _require_text(transform, "transform_status", "sanborn sheet transform")
    if transform_status not in ALLOWED_TRANSFORM_STATUSES:
        raise MindseyeDataError(f"sanborn sheet transform has unsupported status: {transform_status}")
    for control_point_id in control_point_ids:
        if control_point_id not in control_points_by_id:
            raise MindseyeDataError(f"sanborn sheet transform references unknown control point: {control_point_id}")

    return {
        "sheet_id": _require_text(transform, "sheet_id", "sanborn sheet transform"),
        "sheet_number": _require_int(transform, "sheet_number", "sanborn sheet transform"),
        "sheet_role": _require_text(transform, "sheet_role", "sanborn sheet transform"),
        "review_status": _require_text(transform, "review_status", "sanborn sheet transform"),
        "transform_status": transform_status,
        "transform_model": _optional_text(transform, "transform_model"),
        "candidate_neighbor_sheet_ids": _require_text_list(transform, "candidate_neighbor_sheet_ids", "sanborn sheet transform"),
        "control_point_ids": control_point_ids,
        "local_origin": _normalize_point_object(transform.get("local_origin"), "local_origin"),
        "scale_x": _optional_number(transform, "scale_x"),
        "scale_y": _optional_number(transform, "scale_y"),
        "rotation_degrees": _optional_number(transform, "rotation_degrees"),
        "translation": _normalize_translation_object(transform.get("translation")),
        "warnings": _require_text_list(transform, "warnings", "sanborn sheet transform"),
        "notes": _require_text(transform, "notes", "sanborn sheet transform"),
    }


def _normalize_layer(raw: dict[str, Any]) -> dict[str, Any]:
    layer = _require_dict(raw, "sanborn layer")
    layer_id = _require_text(layer, "layer_id", "sanborn layer")
    status = _require_text(layer, "status", "sanborn layer")
    if status not in ALLOWED_LAYER_STATUSES:
        raise MindseyeDataError(f"sanborn layer has unsupported status: {status}")
    return {
        "layer_id": layer_id,
        "label": _require_text(layer, "label", "sanborn layer"),
        "status": status,
        "visual_role": _require_text(layer, "visual_role", "sanborn layer"),
        "review_state": _require_text(layer, "review_state", "sanborn layer"),
        "notes": _require_text(layer, "notes", "sanborn layer"),
    }


def _normalize_point_object(raw: Any, label: str) -> dict[str, float]:
    point = _require_dict(raw, label)
    return {
        "x": _require_number(point, "x", label),
        "y": _require_number(point, "y", label),
    }


def _normalize_translation_object(raw: Any) -> dict[str, float | None]:
    translation = _require_dict(raw, "translation")
    return {
        "x": _optional_number(translation, "x"),
        "y": _optional_number(translation, "y"),
    }


def _control_points_by_sheet_id(manifest: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    by_sheet_id: dict[str, list[dict[str, Any]]] = {}
    for point in manifest["control_points"]:
        by_sheet_id.setdefault(point["sheet_id"], []).append(point)
    return by_sheet_id


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


def _require_text_list(raw: dict[str, Any], key: str, label: str) -> list[str]:
    value = raw.get(key)
    if not isinstance(value, list):
        raise MindseyeDataError(f"{label} missing required text list: {key}")
    result: list[str] = []
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise MindseyeDataError(f"{label} contains invalid text list item: {key}")
        result.append(item)
    return result


def _require_int(raw: dict[str, Any], key: str, label: str) -> int:
    value = raw.get(key)
    if not isinstance(value, int) or isinstance(value, bool):
        raise MindseyeDataError(f"{label} missing required integer field: {key}")
    return value


def _require_number(raw: dict[str, Any], key: str, label: str) -> float:
    value = raw.get(key)
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        raise MindseyeDataError(f"{label} missing required numeric field: {key}")
    return float(value)


def _optional_text(raw: dict[str, Any], key: str) -> str | None:
    value = raw.get(key)
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        raise MindseyeDataError(f"sanborn sheet transform has invalid optional text field: {key}")
    return value


def _optional_number(raw: dict[str, Any], key: str) -> float | None:
    value = raw.get(key)
    if value is None:
        return None
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        raise MindseyeDataError(f"sanborn sheet transform has invalid optional numeric field: {key}")
    return float(value)


def _dedupe_preserve_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result
