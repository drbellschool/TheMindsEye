from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .models import MindseyeDataError, TownPackage, require_text, require_text_tuple
from .schema_validation import validate_json_schema
from .town_loader import load_json, load_town_package, repo_root_from

INSTRUCTIONAL_ALIGNMENT_MANIFEST_FILENAME = "instructional_alignment_manifest.json"
INSTRUCTIONAL_ALIGNMENT_SCHEMA_FILENAME = "instructional-alignment-manifest.schema.json"


@dataclass(frozen=True)
class InstructionalAlignmentRecord:
    alignment_id: str
    framework: str
    subject_area: str
    grade_band: str
    alignment_status: str
    standard_id: str | None
    standard_label: str
    hqim_dimension: str
    evidence_expectations: tuple[str, ...]
    teacher_review_required: bool
    notes: str

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "InstructionalAlignmentRecord":
        return cls(
            alignment_id=require_text(raw, "alignment_id", "instructional alignment"),
            framework=require_text(raw, "framework", "instructional alignment"),
            subject_area=require_text(raw, "subject_area", "instructional alignment"),
            grade_band=require_text(raw, "grade_band", "instructional alignment"),
            alignment_status=require_text(raw, "alignment_status", "instructional alignment"),
            standard_id=optional_text(raw, "standard_id"),
            standard_label=require_text(raw, "standard_label", "instructional alignment"),
            hqim_dimension=require_text(raw, "hqim_dimension", "instructional alignment"),
            evidence_expectations=require_text_tuple(
                raw, "evidence_expectations", "instructional alignment"
            ),
            teacher_review_required=require_bool(
                raw, "teacher_review_required", "instructional alignment"
            ),
            notes=require_text(raw, "notes", "instructional alignment"),
        )


@dataclass(frozen=True)
class InstructionalAlignmentManifest:
    instructional_manifest_id: str
    manifest_type: str
    town_package_id: str
    mission_id: str
    title: str
    hqim_status: str
    teks_status: str
    teacher_authority_rule: str
    record_count: int
    alignments: tuple[InstructionalAlignmentRecord, ...]

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "InstructionalAlignmentManifest":
        alignments = require_object_list(raw, "alignments", "instructional alignment manifest")
        return cls(
            instructional_manifest_id=require_text(
                raw, "instructional_manifest_id", "instructional alignment manifest"
            ),
            manifest_type=require_text(raw, "manifest_type", "instructional alignment manifest"),
            town_package_id=require_text(raw, "town_package_id", "instructional alignment manifest"),
            mission_id=require_text(raw, "mission_id", "instructional alignment manifest"),
            title=require_text(raw, "title", "instructional alignment manifest"),
            hqim_status=require_text(raw, "hqim_status", "instructional alignment manifest"),
            teks_status=require_text(raw, "teks_status", "instructional alignment manifest"),
            teacher_authority_rule=require_text(
                raw, "teacher_authority_rule", "instructional alignment manifest"
            ),
            record_count=require_positive_int(raw, "record_count", "instructional alignment manifest"),
            alignments=tuple(InstructionalAlignmentRecord.from_dict(item) for item in alignments),
        )


def load_instructional_alignment_manifest(
    repo_root: Path | None = None,
    town_slug: str = "texarkana",
    filename: str = INSTRUCTIONAL_ALIGNMENT_MANIFEST_FILENAME,
) -> InstructionalAlignmentManifest:
    """Load and validate the instructional alignment contract for one mission."""
    root = repo_root_from(repo_root)
    manifest_path = root / "data" / "towns" / town_slug / filename
    schema = load_schema(root / "data" / "schemas" / INSTRUCTIONAL_ALIGNMENT_SCHEMA_FILENAME)
    raw_manifest = load_json(manifest_path)
    if not isinstance(raw_manifest, dict):
        raise MindseyeDataError("instructional alignment manifest must be a JSON object")

    try:
        validate_json_schema(raw_manifest, schema, path=filename)
    except ValueError as exc:
        raise MindseyeDataError(str(exc)) from exc
    manifest = InstructionalAlignmentManifest.from_dict(raw_manifest)
    package = load_town_package(root, town_slug)
    assert_instructional_alignment_manifest_links(manifest, package)
    return manifest


def assert_instructional_alignment_manifest_links(
    manifest: InstructionalAlignmentManifest,
    package: TownPackage,
) -> None:
    if manifest.manifest_type != "mission_instructional_alignment_manifest":
        raise MindseyeDataError("instructional alignment manifest has unsupported manifest_type")
    if manifest.town_package_id != package.package_id:
        raise MindseyeDataError(
            "instructional alignment manifest town_package_id does not match town package"
        )
    if manifest.mission_id not in {mission_seed.mission_id for mission_seed in package.mission_seeds}:
        raise MindseyeDataError("instructional alignment manifest references missing mission_id")
    if manifest.record_count != len(manifest.alignments):
        raise MindseyeDataError("instructional alignment manifest record_count does not match alignments")

    seen_alignment_ids: set[str] = set()
    frameworks = {alignment.framework for alignment in manifest.alignments}
    for alignment in manifest.alignments:
        if alignment.alignment_id in seen_alignment_ids:
            raise MindseyeDataError(f"duplicate instructional alignment id: {alignment.alignment_id}")
        seen_alignment_ids.add(alignment.alignment_id)

        if not alignment.teacher_review_required:
            raise MindseyeDataError(
                f"instructional alignment {alignment.alignment_id} must require teacher review"
            )
        if alignment.framework == "HQIM" and alignment.standard_id is not None:
            raise MindseyeDataError(
                f"instructional alignment {alignment.alignment_id} must not set standard_id for HQIM"
            )
        if alignment.framework == "TEKS" and alignment.alignment_status == "reviewed" and alignment.standard_id is None:
            raise MindseyeDataError(
                f"instructional alignment {alignment.alignment_id} needs standard_id once TEKS is reviewed"
            )
        if alignment.framework == "TEKS" and manifest.teks_status == "pending_teacher_selection" and alignment.standard_id is not None:
            raise MindseyeDataError(
                f"instructional alignment {alignment.alignment_id} cannot set standard_id while TEKS status is pending_teacher_selection"
            )

    if "HQIM" not in frameworks:
        raise MindseyeDataError("instructional alignment manifest must include at least one HQIM record")
    if "TEKS" not in frameworks:
        raise MindseyeDataError("instructional alignment manifest must include at least one TEKS record")


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
