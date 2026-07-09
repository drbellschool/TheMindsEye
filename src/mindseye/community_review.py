from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .models import MindseyeDataError, TownPackage, require_text, require_text_tuple
from .review_state import apply_community_review_state, load_review_state
from .schema_validation import validate_json_schema
from .town_loader import load_json, load_town_package, repo_root_from

COMMUNITY_REVIEW_MANIFEST_FILENAME = "community_review_manifest.json"
COMMUNITY_REVIEW_SCHEMA_FILENAME = "community-review-manifest.schema.json"

ALLOWED_REVIEW_STATUSES = {
    "suggested",
    "under_review",
    "confirmed",
    "rejected",
    "insufficient_evidence",
}

ALLOWED_HISTORICAL_BASIS = {
    "verified_fact",
    "source_based_inference",
    "fictional_gameplay",
}


@dataclass(frozen=True)
class SourceIssueRecord:
    source_issue_id: str
    source_id: str
    publication_title: str
    issue_date: str
    volume: str
    number: str
    edition: str
    page: str
    page_url: str
    citation: str
    ocr_excerpt: str
    notes: str

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "SourceIssueRecord":
        return cls(
            source_issue_id=require_text(raw, "source_issue_id", "source issue"),
            source_id=require_text(raw, "source_id", "source issue"),
            publication_title=require_text(raw, "publication_title", "source issue"),
            issue_date=require_text(raw, "issue_date", "source issue"),
            volume=require_text(raw, "volume", "source issue"),
            number=require_text(raw, "number", "source issue"),
            edition=require_text(raw, "edition", "source issue"),
            page=require_text(raw, "page", "source issue"),
            page_url=require_text(raw, "page_url", "source issue"),
            citation=require_text(raw, "citation", "source issue"),
            ocr_excerpt=require_text(raw, "ocr_excerpt", "source issue"),
            notes=require_text(raw, "notes", "source issue"),
        )


@dataclass(frozen=True)
class CommunityReviewRecord:
    review_record_id: str
    entity_type: str
    entity_id: str
    display_name: str
    review_status: str
    historical_basis: str
    source_ids: tuple[str, ...]
    source_issue_id: str
    related_location_ids: tuple[str, ...]
    notes: str

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "CommunityReviewRecord":
        return cls(
            review_record_id=require_text(raw, "review_record_id", "community review record"),
            entity_type=require_text(raw, "entity_type", "community review record"),
            entity_id=require_text(raw, "entity_id", "community review record"),
            display_name=require_text(raw, "display_name", "community review record"),
            review_status=require_text(raw, "review_status", "community review record"),
            historical_basis=require_text(raw, "historical_basis", "community review record"),
            source_ids=require_text_tuple(raw, "source_ids", "community review record"),
            source_issue_id=require_text(raw, "source_issue_id", "community review record"),
            related_location_ids=require_text_tuple(
                raw, "related_location_ids", "community review record", allow_empty=True
            ),
            notes=require_text(raw, "notes", "community review record"),
        )


@dataclass(frozen=True)
class CommunityReviewManifest:
    community_review_manifest_id: str
    manifest_type: str
    town_package_id: str
    review_queue_status: str
    promotion_rule: str
    record_count: int
    source_issue_count: int
    claim_boundary: dict[str, str]
    source_issues: tuple[SourceIssueRecord, ...]
    people: tuple[CommunityReviewRecord, ...]
    businesses: tuple[CommunityReviewRecord, ...]

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "CommunityReviewManifest":
        source_issues = require_object_list(raw, "source_issues", "community review manifest")
        people = require_object_list(raw, "people", "community review manifest")
        businesses = require_object_list(raw, "businesses", "community review manifest")
        return cls(
            community_review_manifest_id=require_text(
                raw, "community_review_manifest_id", "community review manifest"
            ),
            manifest_type=require_text(raw, "manifest_type", "community review manifest"),
            town_package_id=require_text(raw, "town_package_id", "community review manifest"),
            review_queue_status=require_text(raw, "review_queue_status", "community review manifest"),
            promotion_rule=require_text(raw, "promotion_rule", "community review manifest"),
            record_count=require_positive_int(raw, "record_count", "community review manifest"),
            source_issue_count=require_positive_int(raw, "source_issue_count", "community review manifest"),
            claim_boundary=require_text_mapping(raw, "claim_boundary", "community review manifest"),
            source_issues=tuple(SourceIssueRecord.from_dict(item) for item in source_issues),
            people=tuple(CommunityReviewRecord.from_dict(item) for item in people),
            businesses=tuple(CommunityReviewRecord.from_dict(item) for item in businesses),
        )


def load_community_review_manifest(
    repo_root: Path | None = None,
    town_slug: str = "texarkana",
    filename: str = COMMUNITY_REVIEW_MANIFEST_FILENAME,
) -> CommunityReviewManifest:
    """Load the town's people/business review queue and issue adapters."""
    root = repo_root_from(repo_root)
    manifest_path = root / "data" / "towns" / town_slug / filename
    schema = load_schema(root / "data" / "schemas" / COMMUNITY_REVIEW_SCHEMA_FILENAME)
    raw_manifest = load_json(manifest_path)
    if not isinstance(raw_manifest, dict):
        raise MindseyeDataError("community review manifest must be a JSON object")

    try:
        validate_json_schema(raw_manifest, schema, path=filename)
    except ValueError as exc:
        raise MindseyeDataError(str(exc)) from exc
    manifest = CommunityReviewManifest.from_dict(raw_manifest)
    package = load_town_package(root, town_slug)
    assert_community_review_manifest_links(manifest, package)
    return manifest


def build_community_review_packet(
    package: TownPackage,
    repo_root: Path | None = None,
    town_slug: str = "texarkana",
    state_root: Path | None = None,
) -> dict[str, object]:
    """Return a normalized review packet for people, businesses, and source issues."""
    manifest = load_community_review_manifest(repo_root, town_slug)
    if manifest.town_package_id != package.package_id:
        raise MindseyeDataError("community review manifest town_package_id mismatch")

    source_issues_by_id = {issue.source_issue_id: issue for issue in manifest.source_issues}
    packet = {
        "community_review_manifest_id": manifest.community_review_manifest_id,
        "town_package_id": manifest.town_package_id,
        "review_queue_status": manifest.review_queue_status,
        "promotion_rule": manifest.promotion_rule,
        "record_count": manifest.record_count,
        "source_issue_count": manifest.source_issue_count,
        "claim_boundary": dict(manifest.claim_boundary),
        "source_issues": [_source_issue_summary(issue) for issue in manifest.source_issues],
        "people": [
            _review_record_summary(record, source_issues_by_id)
            for record in manifest.people
        ],
        "businesses": [
            _review_record_summary(record, source_issues_by_id)
            for record in manifest.businesses
        ],
    }
    return apply_community_review_state(packet, load_review_state(state_root))


def assert_community_review_manifest_links(
    manifest: CommunityReviewManifest,
    package: TownPackage,
) -> None:
    if manifest.manifest_type != "town_community_review_manifest":
        raise MindseyeDataError("community review manifest has unsupported manifest_type")
    if manifest.town_package_id != package.package_id:
        raise MindseyeDataError("community review manifest town_package_id does not match town package")
    if manifest.record_count != (len(manifest.people) + len(manifest.businesses)):
        raise MindseyeDataError("community review manifest record_count does not match records")
    if manifest.source_issue_count != len(manifest.source_issues):
        raise MindseyeDataError("community review manifest source_issue_count does not match source_issues")

    source_ids = package.source_ids
    location_ids = package.location_ids
    seen_issue_ids: set[str] = set()
    for issue in manifest.source_issues:
        if issue.source_issue_id in seen_issue_ids:
            raise MindseyeDataError(f"duplicate source issue id: {issue.source_issue_id}")
        seen_issue_ids.add(issue.source_issue_id)
        if issue.source_id not in source_ids:
            raise MindseyeDataError(
                f"source issue {issue.source_issue_id} references missing source: {issue.source_id}"
            )

    issue_ids = {issue.source_issue_id for issue in manifest.source_issues}
    seen_review_ids: set[str] = set()
    for record in (*manifest.people, *manifest.businesses):
        if record.review_record_id in seen_review_ids:
            raise MindseyeDataError(f"duplicate community review record id: {record.review_record_id}")
        seen_review_ids.add(record.review_record_id)
        if record.entity_type not in {"person", "business"}:
            raise MindseyeDataError(
                f"community review record {record.review_record_id} has unsupported entity_type: {record.entity_type}"
            )
        if record.review_status not in ALLOWED_REVIEW_STATUSES:
            raise MindseyeDataError(
                f"community review record {record.review_record_id} has unsupported review_status: {record.review_status}"
            )
        if record.historical_basis not in ALLOWED_HISTORICAL_BASIS:
            raise MindseyeDataError(
                f"community review record {record.review_record_id} has unsupported historical_basis: {record.historical_basis}"
            )
        if record.source_issue_id not in issue_ids:
            raise MindseyeDataError(
                f"community review record {record.review_record_id} references missing source issue: {record.source_issue_id}"
            )
        if not record.source_ids:
            raise MindseyeDataError(
                f"community review record {record.review_record_id} needs at least one source"
            )
        for source_id in record.source_ids:
            if source_id not in source_ids:
                raise MindseyeDataError(
                    f"community review record {record.review_record_id} references missing source: {source_id}"
                )
        for location_id in record.related_location_ids:
            if location_id not in location_ids:
                raise MindseyeDataError(
                    f"community review record {record.review_record_id} references missing location: {location_id}"
                )


def _source_issue_summary(issue: SourceIssueRecord) -> dict[str, object]:
    return {
        "source_issue_id": issue.source_issue_id,
        "source_id": issue.source_id,
        "publication_title": issue.publication_title,
        "issue_date": issue.issue_date,
        "volume": issue.volume,
        "number": issue.number,
        "edition": issue.edition,
        "page": issue.page,
        "page_url": issue.page_url,
        "citation": issue.citation,
        "ocr_excerpt": issue.ocr_excerpt,
        "notes": issue.notes,
    }


def _review_record_summary(
    record: CommunityReviewRecord,
    source_issues_by_id: dict[str, SourceIssueRecord],
) -> dict[str, object]:
    return {
        "review_record_id": record.review_record_id,
        "entity_type": record.entity_type,
        "entity_id": record.entity_id,
        "display_name": record.display_name,
        "review_status": record.review_status,
        "historical_basis": record.historical_basis,
        "source_ids": list(record.source_ids),
        "source_issue_id": record.source_issue_id,
        "source_issue": _source_issue_summary(source_issues_by_id[record.source_issue_id]),
        "related_location_ids": list(record.related_location_ids),
        "notes": record.notes,
    }


def load_schema(path: Path) -> dict[str, Any]:
    schema = load_json(path)
    if not isinstance(schema, dict):
        raise MindseyeDataError(f"schema must be a JSON object: {path.name}")
    return schema


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
        raise MindseyeDataError(f"{label} missing required object field: {key}")
    for sub_key, sub_value in value.items():
        if not isinstance(sub_key, str) or not isinstance(sub_value, str):
            raise MindseyeDataError(f"{label} object must contain text values: {key}")
    return value
