from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .instructional_alignment import (
    InstructionalAlignmentManifest,
    load_instructional_alignment_manifest,
)
from .models import MindseyeDataError, TownPackage, require_text
from .schema_validation import validate_json_schema
from .town_loader import load_json, load_town_package, repo_root_from

TEACHER_REVIEW_MANIFEST_FILENAME = "teacher_review_manifest.json"
TEACHER_REVIEW_SCHEMA_FILENAME = "teacher-review-manifest.schema.json"


@dataclass(frozen=True)
class TeacherReviewItem:
    review_item_id: str
    alignment_id: str
    framework: str
    decision_state: str
    standard_id: str | None
    teacher_review_required: bool
    notes: str

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "TeacherReviewItem":
        return cls(
            review_item_id=require_text(raw, "review_item_id", "teacher review item"),
            alignment_id=require_text(raw, "alignment_id", "teacher review item"),
            framework=require_text(raw, "framework", "teacher review item"),
            decision_state=require_text(raw, "decision_state", "teacher review item"),
            standard_id=optional_text(raw, "standard_id"),
            teacher_review_required=require_bool(raw, "teacher_review_required", "teacher review item"),
            notes=require_text(raw, "notes", "teacher review item"),
        )


@dataclass(frozen=True)
class TeacherReviewManifest:
    teacher_review_manifest_id: str
    manifest_type: str
    town_package_id: str
    mission_id: str
    instructional_manifest_id: str
    title: str
    teacher_authority_rule: str
    review_status: str
    mission_release_status: str
    record_count: int
    review_items: tuple[TeacherReviewItem, ...]

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "TeacherReviewManifest":
        review_items = require_object_list(raw, "review_items", "teacher review manifest")
        return cls(
            teacher_review_manifest_id=require_text(
                raw, "teacher_review_manifest_id", "teacher review manifest"
            ),
            manifest_type=require_text(raw, "manifest_type", "teacher review manifest"),
            town_package_id=require_text(raw, "town_package_id", "teacher review manifest"),
            mission_id=require_text(raw, "mission_id", "teacher review manifest"),
            instructional_manifest_id=require_text(
                raw, "instructional_manifest_id", "teacher review manifest"
            ),
            title=require_text(raw, "title", "teacher review manifest"),
            teacher_authority_rule=require_text(raw, "teacher_authority_rule", "teacher review manifest"),
            review_status=require_text(raw, "review_status", "teacher review manifest"),
            mission_release_status=require_text(raw, "mission_release_status", "teacher review manifest"),
            record_count=require_positive_int(raw, "record_count", "teacher review manifest"),
            review_items=tuple(TeacherReviewItem.from_dict(item) for item in review_items),
        )


def load_teacher_review_manifest(
    repo_root: Path | None = None,
    town_slug: str = "texarkana",
    filename: str = TEACHER_REVIEW_MANIFEST_FILENAME,
) -> TeacherReviewManifest:
    """Load the explicit teacher review and mission approval contract."""
    root = repo_root_from(repo_root)
    manifest_path = root / "data" / "towns" / town_slug / filename
    schema = load_schema(root / "data" / "schemas" / TEACHER_REVIEW_SCHEMA_FILENAME)
    raw_manifest = load_json(manifest_path)
    if not isinstance(raw_manifest, dict):
        raise MindseyeDataError("teacher review manifest must be a JSON object")

    try:
        validate_json_schema(raw_manifest, schema, path=filename)
    except ValueError as exc:
        raise MindseyeDataError(str(exc)) from exc
    manifest = TeacherReviewManifest.from_dict(raw_manifest)
    package = load_town_package(root, town_slug)
    instructional_alignment_manifest = load_instructional_alignment_manifest(root, town_slug)
    assert_teacher_review_manifest_links(manifest, package, instructional_alignment_manifest)
    return manifest


def build_teacher_approval_packet(
    package: TownPackage,
    mission_id: str | None = None,
    repo_root: Path | None = None,
    town_slug: str = "texarkana",
) -> dict[str, object]:
    """Return the teacher approval state for an existing mission packet."""
    resolved_mission_id = mission_id or package.mission_seed.mission_id
    manifest = load_teacher_review_manifest(repo_root, town_slug)
    if manifest.mission_id != resolved_mission_id:
        raise MindseyeDataError("teacher review manifest mission_id does not match requested mission")
    alignment_manifest = load_instructional_alignment_manifest(repo_root, town_slug)
    return _teacher_approval_packet(manifest, alignment_manifest)


def _teacher_approval_packet(
    manifest: TeacherReviewManifest,
    alignment_manifest: InstructionalAlignmentManifest,
) -> dict[str, object]:
    alignment_by_id = {alignment.alignment_id: alignment for alignment in alignment_manifest.alignments}
    items = []
    pending_alignment_ids: list[str] = []
    approved_alignment_ids: list[str] = []
    rejected_alignment_ids: list[str] = []
    for item in manifest.review_items:
        alignment = alignment_by_id[item.alignment_id]
        if item.decision_state == "pending_teacher_selection":
            pending_alignment_ids.append(item.alignment_id)
        elif item.decision_state == "approved":
            approved_alignment_ids.append(item.alignment_id)
        elif item.decision_state == "rejected":
            rejected_alignment_ids.append(item.alignment_id)
        items.append(
            {
                "review_item_id": item.review_item_id,
                "alignment_id": item.alignment_id,
                "framework": item.framework,
                "decision_state": item.decision_state,
                "standard_id": item.standard_id,
                "standard_label": alignment.standard_label,
                "teacher_review_required": item.teacher_review_required,
                "notes": item.notes,
            }
        )

    classroom_release_ready = (
        manifest.review_status == "approved"
        and manifest.mission_release_status == "approved_for_classroom_use"
        and not pending_alignment_ids
        and not rejected_alignment_ids
    )
    return {
        "teacher_review_manifest_id": manifest.teacher_review_manifest_id,
        "instructional_manifest_id": manifest.instructional_manifest_id,
        "mission_id": manifest.mission_id,
        "town_package_id": manifest.town_package_id,
        "title": manifest.title,
        "review_status": manifest.review_status,
        "mission_release_status": manifest.mission_release_status,
        "teacher_authority_rule": manifest.teacher_authority_rule,
        "record_count": manifest.record_count,
        "classroom_release_ready": classroom_release_ready,
        "pending_alignment_ids": pending_alignment_ids,
        "approved_alignment_ids": approved_alignment_ids,
        "rejected_alignment_ids": rejected_alignment_ids,
        "review_items": items,
    }


def assert_teacher_review_manifest_links(
    manifest: TeacherReviewManifest,
    package: TownPackage,
    instructional_alignment_manifest: InstructionalAlignmentManifest,
) -> None:
    if manifest.manifest_type != "mission_teacher_review_manifest":
        raise MindseyeDataError("teacher review manifest has unsupported manifest_type")
    if manifest.town_package_id != package.package_id:
        raise MindseyeDataError("teacher review manifest town_package_id does not match town package")
    if manifest.mission_id != package.mission_seed.mission_id:
        raise MindseyeDataError("teacher review manifest mission_id does not match town package mission")
    if manifest.instructional_manifest_id != instructional_alignment_manifest.instructional_manifest_id:
        raise MindseyeDataError("teacher review manifest instructional_manifest_id mismatch")
    if manifest.record_count != len(manifest.review_items):
        raise MindseyeDataError("teacher review manifest record_count does not match review_items")
    if manifest.mission_id != instructional_alignment_manifest.mission_id:
        raise MindseyeDataError("teacher review manifest mission_id does not match instructional alignment")

    alignment_by_id = {alignment.alignment_id: alignment for alignment in instructional_alignment_manifest.alignments}
    seen_review_ids: set[str] = set()
    frameworks: set[str] = set()
    has_teks_review = False
    for item in manifest.review_items:
        if item.review_item_id in seen_review_ids:
            raise MindseyeDataError(f"duplicate teacher review item id: {item.review_item_id}")
        seen_review_ids.add(item.review_item_id)
        if not item.teacher_review_required:
            raise MindseyeDataError(f"teacher review item {item.review_item_id} must require review")

        alignment = alignment_by_id.get(item.alignment_id)
        if alignment is None:
            raise MindseyeDataError(
                f"teacher review item {item.review_item_id} references missing alignment: {item.alignment_id}"
            )
        if item.framework != alignment.framework:
            raise MindseyeDataError(f"teacher review item {item.review_item_id} framework mismatch")
        frameworks.add(item.framework)
        if item.framework == "TEKS":
            has_teks_review = True
        if item.decision_state == "approved":
            if item.framework == "TEKS" and item.standard_id is None:
                raise MindseyeDataError(
                    f"teacher review item {item.review_item_id} needs standard_id once TEKS is approved"
                )
            if item.framework != "TEKS" and item.standard_id is not None:
                raise MindseyeDataError(
                    f"teacher review item {item.review_item_id} must not set standard_id for HQIM review"
                )
        elif item.decision_state in {"pending_teacher_selection", "rejected"}:
            if item.standard_id is not None:
                raise MindseyeDataError(
                    f"teacher review item {item.review_item_id} cannot set standard_id before approval"
                )
        else:
            raise MindseyeDataError(
                f"teacher review item {item.review_item_id} has unsupported decision_state: {item.decision_state}"
            )

    if "HQIM" not in frameworks:
        raise MindseyeDataError("teacher review manifest must include at least one HQIM review item")
    if not has_teks_review:
        raise MindseyeDataError("teacher review manifest must include at least one TEKS review item")
    if manifest.review_status == "approved" and manifest.mission_release_status != "approved_for_classroom_use":
        raise MindseyeDataError("approved teacher review manifest must mark mission release ready")
    if manifest.review_status == "rejected" and manifest.mission_release_status == "approved_for_classroom_use":
        raise MindseyeDataError("rejected teacher review manifest cannot be classroom ready")


def require_bool(raw: dict[str, Any], key: str, label: str) -> bool:
    value = raw.get(key)
    if not isinstance(value, bool):
        raise MindseyeDataError(f"{label} missing required boolean field: {key}")
    return value


def require_positive_int(raw: dict[str, Any], key: str, label: str) -> int:
    value = raw.get(key)
    if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
        raise MindseyeDataError(f"{label} missing required positive integer field: {key}")
    return value


def require_object_list(raw: dict[str, Any], key: str, label: str) -> list[dict[str, Any]]:
    value = raw.get(key)
    if not isinstance(value, list) or not value:
        raise MindseyeDataError(f"{label} missing required object list: {key}")
    if any(not isinstance(item, dict) for item in value):
        raise MindseyeDataError(f"{label} contains invalid object in: {key}")
    return value


def optional_text(raw: dict[str, Any], key: str) -> str | None:
    value = raw.get(key)
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        raise MindseyeDataError(f"optional field must be non-empty text when present: {key}")
    return value


def load_schema(path: Path) -> dict[str, Any]:
    schema = load_json(path)
    if not isinstance(schema, dict):
        raise MindseyeDataError(f"schema must be a JSON object: {path.name}")
    return schema
