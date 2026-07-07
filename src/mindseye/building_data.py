from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .models import MindseyeDataError, TownPackage, require_text, require_text_tuple
from .review_state import apply_building_manifest_state, load_review_state
from .sanborn import (
    SanbornSheetReviewManifest,
    SanbornStitchingManifest,
    load_sanborn_sheet_review_manifest,
    load_sanborn_stitching_manifest,
)
from .schema_validation import validate_json_schema
from .town_loader import load_json, load_town_package, repo_root_from

BUILDING_MANIFEST_FILENAME = "building_manifest.json"
BUILDING_SCHEMA_FILENAME = "building-manifest.schema.json"
VERIFICATION_SUGGESTION_MANIFEST_FILENAME = "verification_suggestion_manifest.json"
VERIFICATION_SUGGESTION_SCHEMA_FILENAME = "verification-suggestion-manifest.schema.json"


@dataclass(frozen=True)
class BuildingRecord:
    building_id: str
    location_id: str
    map_id: str
    source_ids: tuple[str, ...]
    supporting_claim_ids: tuple[str, ...]
    suggestion_ids: tuple[str, ...]
    review_record_id: str | None
    sheet_id: str | None
    sheet_number: int | None
    anchor_status: str
    existence_status: str
    identity_status: str
    identity_basis: str
    reviewed_label: str
    historical_function: str
    visual_detail_status: str
    default_render_mode: str
    student_safe_name: str
    student_visible: bool
    teacher_visible: bool
    notes: str = ""

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "BuildingRecord":
        return cls(
            building_id=require_text(raw, "building_id", "building record"),
            location_id=require_text(raw, "location_id", "building record"),
            map_id=require_text(raw, "map_id", "building record"),
            source_ids=require_text_tuple(raw, "source_ids", "building record", allow_empty=True),
            supporting_claim_ids=require_text_tuple(
                raw, "supporting_claim_ids", "building record", allow_empty=True
            ),
            suggestion_ids=require_text_tuple(raw, "suggestion_ids", "building record", allow_empty=True),
            review_record_id=optional_text(raw, "review_record_id"),
            sheet_id=optional_text(raw, "sheet_id"),
            sheet_number=optional_int(raw, "sheet_number"),
            anchor_status=require_text(raw, "anchor_status", "building record"),
            existence_status=require_text(raw, "existence_status", "building record"),
            identity_status=require_text(raw, "identity_status", "building record"),
            identity_basis=require_text(raw, "identity_basis", "building record"),
            reviewed_label=str(raw.get("reviewed_label", "")),
            historical_function=str(raw.get("historical_function", "")),
            visual_detail_status=require_text(raw, "visual_detail_status", "building record"),
            default_render_mode=require_text(raw, "default_render_mode", "building record"),
            student_safe_name=require_text(raw, "student_safe_name", "building record"),
            student_visible=require_bool(raw, "student_visible", "building record"),
            teacher_visible=require_bool(raw, "teacher_visible", "building record"),
            notes=str(raw.get("notes", "")),
        )


@dataclass(frozen=True)
class BuildingManifest:
    building_manifest_id: str
    manifest_type: str
    town_package_id: str
    map_id: str
    source_ids: tuple[str, ...]
    sheet_review_manifest_id: str
    stitching_manifest_id: str
    title: str
    review_scope: str
    location_extraction_status: str
    building_identity_status: str
    building_art_status: str
    claim_boundary: dict[str, str]
    record_count: int
    buildings: tuple[BuildingRecord, ...]

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "BuildingManifest":
        buildings = require_object_list(raw, "buildings", "building manifest")
        return cls(
            building_manifest_id=require_text(raw, "building_manifest_id", "building manifest"),
            manifest_type=require_text(raw, "manifest_type", "building manifest"),
            town_package_id=require_text(raw, "town_package_id", "building manifest"),
            map_id=require_text(raw, "map_id", "building manifest"),
            source_ids=require_text_tuple(raw, "source_ids", "building manifest"),
            sheet_review_manifest_id=require_text(raw, "sheet_review_manifest_id", "building manifest"),
            stitching_manifest_id=require_text(raw, "stitching_manifest_id", "building manifest"),
            title=require_text(raw, "title", "building manifest"),
            review_scope=require_text(raw, "review_scope", "building manifest"),
            location_extraction_status=require_text(
                raw, "location_extraction_status", "building manifest"
            ),
            building_identity_status=require_text(raw, "building_identity_status", "building manifest"),
            building_art_status=require_text(raw, "building_art_status", "building manifest"),
            claim_boundary=require_text_mapping(raw, "claim_boundary", "building manifest"),
            record_count=require_positive_int(raw, "record_count", "building manifest"),
            buildings=tuple(BuildingRecord.from_dict(item) for item in buildings),
        )


@dataclass(frozen=True)
class VerificationSuggestionRecord:
    suggestion_id: str
    target_building_id: str
    location_id: str
    suggestion_type: str
    status: str
    candidate_label: str
    source_ids: tuple[str, ...]
    suggestion_origin: str
    confidence: str
    historical_basis: str
    auto_publish: bool
    student_visible: bool
    review_notes: str

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "VerificationSuggestionRecord":
        return cls(
            suggestion_id=require_text(raw, "suggestion_id", "verification suggestion"),
            target_building_id=require_text(raw, "target_building_id", "verification suggestion"),
            location_id=require_text(raw, "location_id", "verification suggestion"),
            suggestion_type=require_text(raw, "suggestion_type", "verification suggestion"),
            status=require_text(raw, "status", "verification suggestion"),
            candidate_label=require_text(raw, "candidate_label", "verification suggestion"),
            source_ids=require_text_tuple(raw, "source_ids", "verification suggestion"),
            suggestion_origin=require_text(raw, "suggestion_origin", "verification suggestion"),
            confidence=require_text(raw, "confidence", "verification suggestion"),
            historical_basis=require_text(raw, "historical_basis", "verification suggestion"),
            auto_publish=require_bool(raw, "auto_publish", "verification suggestion"),
            student_visible=require_bool(raw, "student_visible", "verification suggestion"),
            review_notes=require_text(raw, "review_notes", "verification suggestion"),
        )


@dataclass(frozen=True)
class VerificationSuggestionManifest:
    suggestion_manifest_id: str
    manifest_type: str
    town_package_id: str
    map_id: str
    building_manifest_id: str
    source_ids: tuple[str, ...]
    title: str
    review_queue_status: str
    promotion_rule: str
    claim_boundary: dict[str, str]
    candidate_count: int
    suggestions: tuple[VerificationSuggestionRecord, ...]

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "VerificationSuggestionManifest":
        suggestions = require_object_list(raw, "suggestions", "verification suggestion manifest")
        return cls(
            suggestion_manifest_id=require_text(
                raw, "suggestion_manifest_id", "verification suggestion manifest"
            ),
            manifest_type=require_text(raw, "manifest_type", "verification suggestion manifest"),
            town_package_id=require_text(raw, "town_package_id", "verification suggestion manifest"),
            map_id=require_text(raw, "map_id", "verification suggestion manifest"),
            building_manifest_id=require_text(
                raw, "building_manifest_id", "verification suggestion manifest"
            ),
            source_ids=require_text_tuple(raw, "source_ids", "verification suggestion manifest"),
            title=require_text(raw, "title", "verification suggestion manifest"),
            review_queue_status=require_text(
                raw, "review_queue_status", "verification suggestion manifest"
            ),
            promotion_rule=require_text(raw, "promotion_rule", "verification suggestion manifest"),
            claim_boundary=require_text_mapping(
                raw, "claim_boundary", "verification suggestion manifest"
            ),
            candidate_count=require_positive_int(raw, "candidate_count", "verification suggestion manifest"),
            suggestions=tuple(VerificationSuggestionRecord.from_dict(item) for item in suggestions),
        )


def load_building_manifest(
    repo_root: Path | None = None,
    town_slug: str = "texarkana",
    filename: str = BUILDING_MANIFEST_FILENAME,
    state_root: Path | None = None,
) -> BuildingManifest:
    """Load and validate building-anchor records for the current town package."""
    root = repo_root_from(repo_root)
    manifest_path = root / "data" / "towns" / town_slug / filename
    schema = load_schema(root / "data" / "schemas" / BUILDING_SCHEMA_FILENAME)
    raw_manifest = load_json(manifest_path)
    if not isinstance(raw_manifest, dict):
        raise MindseyeDataError("building manifest must be a JSON object")

    try:
        validate_json_schema(raw_manifest, schema, path=filename)
    except ValueError as exc:
        raise MindseyeDataError(str(exc)) from exc
    manifest = BuildingManifest.from_dict(raw_manifest)
    package = load_town_package(root, town_slug)
    sheet_review_manifest = load_sanborn_sheet_review_manifest(root, town_slug)
    stitching_manifest = load_sanborn_stitching_manifest(root, town_slug)
    assert_building_manifest_links(manifest, package, sheet_review_manifest, stitching_manifest)
    state = load_review_state(state_root)
    return apply_building_manifest_state(manifest, state)


def load_verification_suggestion_manifest(
    repo_root: Path | None = None,
    town_slug: str = "texarkana",
    filename: str = VERIFICATION_SUGGESTION_MANIFEST_FILENAME,
) -> VerificationSuggestionManifest:
    """Load and validate the human-review suggestion queue for map identities."""
    root = repo_root_from(repo_root)
    manifest_path = root / "data" / "towns" / town_slug / filename
    schema = load_schema(root / "data" / "schemas" / VERIFICATION_SUGGESTION_SCHEMA_FILENAME)
    raw_manifest = load_json(manifest_path)
    if not isinstance(raw_manifest, dict):
        raise MindseyeDataError("verification suggestion manifest must be a JSON object")

    try:
        validate_json_schema(raw_manifest, schema, path=filename)
    except ValueError as exc:
        raise MindseyeDataError(str(exc)) from exc
    suggestion_manifest = VerificationSuggestionManifest.from_dict(raw_manifest)
    package = load_town_package(root, town_slug)
    building_manifest = load_building_manifest(root, town_slug)
    assert_verification_suggestion_manifest_links(suggestion_manifest, building_manifest, package)
    return suggestion_manifest


def assert_building_manifest_links(
    manifest: BuildingManifest,
    package: TownPackage,
    sheet_review_manifest: SanbornSheetReviewManifest,
    stitching_manifest: SanbornStitchingManifest,
) -> None:
    if manifest.manifest_type != "town_building_manifest":
        raise MindseyeDataError("building manifest has unsupported manifest_type")
    if manifest.town_package_id != package.package_id:
        raise MindseyeDataError("building manifest town_package_id does not match town package")
    if manifest.map_id not in {layer["map_id"] for layer in package.map_layers}:
        raise MindseyeDataError("building manifest map_id does not match any package map layer")
    if manifest.sheet_review_manifest_id != sheet_review_manifest.sheet_review_manifest_id:
        raise MindseyeDataError("building manifest sheet_review_manifest_id mismatch")
    if manifest.stitching_manifest_id != stitching_manifest.stitching_manifest_id:
        raise MindseyeDataError("building manifest stitching_manifest_id mismatch")
    if manifest.record_count != len(manifest.buildings):
        raise MindseyeDataError("building manifest record_count does not match buildings")

    for source_id in manifest.source_ids:
        if source_id not in package.source_ids:
            raise MindseyeDataError(f"building manifest references missing source: {source_id}")

    reviews_by_id = {
        review.review_record_id: review for review in sheet_review_manifest.reviews
    }
    seen_building_ids: set[str] = set()
    for building in manifest.buildings:
        if building.building_id in seen_building_ids:
            raise MindseyeDataError(f"duplicate building id: {building.building_id}")
        seen_building_ids.add(building.building_id)

        if building.location_id not in package.location_ids:
            raise MindseyeDataError(
                f"building {building.building_id} references missing location: {building.location_id}"
            )
        if building.map_id != manifest.map_id:
            raise MindseyeDataError(f"building {building.building_id} map_id mismatch")
        for source_id in building.source_ids:
            if source_id not in package.source_ids:
                raise MindseyeDataError(
                    f"building {building.building_id} references missing source: {source_id}"
                )
        for claim_id in building.supporting_claim_ids:
            if claim_id not in package.claim_ids:
                raise MindseyeDataError(
                    f"building {building.building_id} references missing claim: {claim_id}"
                )
        if building.identity_status == "unknown" and building.identity_basis != "unassigned":
            raise MindseyeDataError(
                f"building {building.building_id} cannot assign identity_basis before identity review"
            )
        if building.identity_status in {"reviewed", "approved"} and not building.reviewed_label.strip():
            raise MindseyeDataError(
                f"building {building.building_id} needs reviewed_label once identity is reviewed"
            )
        if building.identity_status in {"reviewed", "approved"} and building.review_record_id is None:
            raise MindseyeDataError(
                f"building {building.building_id} needs review_record_id once identity is reviewed"
            )
        if building.identity_status in {"reviewed", "approved"} and not building.supporting_claim_ids:
            raise MindseyeDataError(
                f"building {building.building_id} needs supporting_claim_ids once identity is reviewed"
            )
        if building.default_render_mode == "reviewed_art_only" and building.visual_detail_status == "illustrative":
            raise MindseyeDataError(
                f"building {building.building_id} cannot require reviewed art with illustrative detail only"
            )
        if building.review_record_id is not None:
            review = reviews_by_id.get(building.review_record_id)
            if review is None:
                raise MindseyeDataError(
                    f"building {building.building_id} references unknown review_record_id: {building.review_record_id}"
                )
            if building.sheet_id is None or building.sheet_number is None:
                raise MindseyeDataError(
                    f"building {building.building_id} needs sheet_id and sheet_number when review_record_id is set"
                )
            if building.sheet_id != review.sheet_id:
                raise MindseyeDataError(f"building {building.building_id} sheet_id mismatch")
            if building.sheet_number != review.sheet_number:
                raise MindseyeDataError(f"building {building.building_id} sheet_number mismatch")
            if building.map_id != review.map_id:
                raise MindseyeDataError(f"building {building.building_id} map_id does not match review record")
            if review.source_id not in building.source_ids:
                raise MindseyeDataError(
                    f"building {building.building_id} must include reviewed sheet source_id"
                )
        elif building.sheet_id is not None or building.sheet_number is not None:
            raise MindseyeDataError(
                f"building {building.building_id} cannot set sheet references without review_record_id"
            )


def assert_verification_suggestion_manifest_links(
    manifest: VerificationSuggestionManifest,
    building_manifest: BuildingManifest,
    package: TownPackage,
) -> None:
    if manifest.manifest_type != "town_verification_suggestion_manifest":
        raise MindseyeDataError("verification suggestion manifest has unsupported manifest_type")
    if manifest.town_package_id != package.package_id:
        raise MindseyeDataError(
            "verification suggestion manifest town_package_id does not match town package"
        )
    if manifest.map_id != building_manifest.map_id:
        raise MindseyeDataError("verification suggestion manifest map_id mismatch")
    if manifest.building_manifest_id != building_manifest.building_manifest_id:
        raise MindseyeDataError("verification suggestion manifest building_manifest_id mismatch")
    if manifest.candidate_count != len(manifest.suggestions):
        raise MindseyeDataError(
            "verification suggestion manifest candidate_count does not match suggestions"
        )

    for source_id in manifest.source_ids:
        if source_id not in package.source_ids:
            raise MindseyeDataError(
                f"verification suggestion manifest references missing source: {source_id}"
            )

    buildings_by_id = {building.building_id: building for building in building_manifest.buildings}
    seen_suggestion_ids: set[str] = set()
    suggestion_ids_by_building: dict[str, set[str]] = {}
    for suggestion in manifest.suggestions:
        if suggestion.suggestion_id in seen_suggestion_ids:
            raise MindseyeDataError(f"duplicate verification suggestion id: {suggestion.suggestion_id}")
        seen_suggestion_ids.add(suggestion.suggestion_id)

        building = buildings_by_id.get(suggestion.target_building_id)
        if building is None:
            raise MindseyeDataError(
                f"verification suggestion references missing building: {suggestion.target_building_id}"
            )
        if suggestion.location_id != building.location_id:
            raise MindseyeDataError(
                f"verification suggestion {suggestion.suggestion_id} location_id mismatch"
            )
        for source_id in suggestion.source_ids:
            if source_id not in package.source_ids:
                raise MindseyeDataError(
                    f"verification suggestion {suggestion.suggestion_id} references missing source: {source_id}"
                )
        if suggestion.auto_publish:
            raise MindseyeDataError(
                f"verification suggestion {suggestion.suggestion_id} must not auto_publish"
            )
        if suggestion.student_visible:
            raise MindseyeDataError(
                f"verification suggestion {suggestion.suggestion_id} must stay hidden from students"
            )

        suggestion_ids_by_building.setdefault(suggestion.target_building_id, set()).add(
            suggestion.suggestion_id
        )

    for building in building_manifest.buildings:
        referenced_ids = set(building.suggestion_ids)
        actual_ids = suggestion_ids_by_building.get(building.building_id, set())
        if referenced_ids != actual_ids:
            raise MindseyeDataError(
                f"building {building.building_id} suggestion_ids do not match suggestion queue"
            )


def load_schema(path: Path) -> dict[str, Any]:
    schema = load_json(path)
    if not isinstance(schema, dict):
        raise MindseyeDataError(f"schema must be a JSON object: {path.name}")
    return schema


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


def require_text_mapping(raw: dict[str, Any], key: str, label: str) -> dict[str, str]:
    value = raw.get(key)
    if not isinstance(value, dict) or not value:
        raise MindseyeDataError(f"{label} missing required text mapping: {key}")

    result: dict[str, str] = {}
    for map_key, map_value in value.items():
        if not isinstance(map_key, str) or not map_key.strip():
            raise MindseyeDataError(f"{label} contains invalid mapping key: {key}")
        if not isinstance(map_value, str) or not map_value.strip():
            raise MindseyeDataError(f"{label} contains invalid mapping value: {key}")
        result[map_key] = map_value
    return result


def optional_text(raw: dict[str, Any], key: str) -> str | None:
    value = raw.get(key)
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        raise MindseyeDataError(f"optional field must be non-empty text when present: {key}")
    return value


def optional_int(raw: dict[str, Any], key: str) -> int | None:
    value = raw.get(key)
    if value is None:
        return None
    if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
        raise MindseyeDataError(f"optional field must be positive integer when present: {key}")
    return value
