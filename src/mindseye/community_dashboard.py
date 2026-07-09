from __future__ import annotations

from pathlib import Path

from .building_data import (
    BuildingManifest,
    VerificationSuggestionManifest,
    load_building_manifest,
    load_verification_suggestion_manifest,
)
from .community_review import (
    CommunityReviewManifest,
    build_community_review_packet,
    load_community_review_manifest,
)
from .map_rendering import build_map_rendering_packet
from .models import MindseyeDataError, TownPackage
from .review_state import history_items_from_events, load_review_state
from .sanborn import SanbornSheetReviewManifest, load_sanborn_sheet_review_manifest
from .teacher_review import build_teacher_approval_packet


def build_community_dashboard_packet(
    package: TownPackage,
    repo_root: Path | None = None,
    town_slug: str = "texarkana",
    state_root: Path | None = None,
) -> dict[str, object]:
    """Build the community review console contract.

    The packet surfaces the accuracy engine that sits upstream of teacher and
    student release. It keeps buildings, people, businesses, roads, labels,
    sources, and candidate matches separated instead of collapsing them into a
    single map blob.
    """
    building_manifest = _optional_building_manifest(repo_root, town_slug, state_root=state_root)
    sheet_review_manifest = _optional_sheet_review_manifest(repo_root, town_slug)
    suggestion_manifest = _optional_verification_suggestion_manifest(repo_root, town_slug)
    community_review_manifest = _optional_community_review_manifest(repo_root, town_slug)
    map_packet = _optional_map_rendering_packet(package, repo_root, town_slug, state_root=state_root)
    teacher_review = _optional_teacher_review_packet(package, repo_root, town_slug)
    community_review = _optional_community_review_packet(package, repo_root, town_slug, state_root=state_root)
    review_state = load_review_state(state_root)

    return {
        "dashboard_id": f"community_dashboard_{package.package_id}",
        "dashboard_title": f"{package.town_name} Community Verification Console",
        "town_package_id": package.package_id,
        "town_name": package.town_name,
        "state_region": package.state_region,
        "year_gate": _historical_year_gate(package),
        "scope_ladder": _scope_ladder(),
        "status_chips": _status_chips(
            package,
            building_manifest,
            sheet_review_manifest,
            suggestion_manifest,
            community_review_manifest,
            map_packet,
            teacher_review,
        ),
        "workspace_tabs": _workspace_tabs(),
        "navigation_links": _navigation_links(),
        "review_domains": _review_domains(
            package,
            building_manifest,
            suggestion_manifest,
            community_review_manifest,
        ),
        "entity_review_panels": _entity_review_panels(
            package,
            building_manifest,
            suggestion_manifest,
            community_review_manifest,
            community_review,
        ),
        "evidence_inspector": _evidence_inspector(package, building_manifest, suggestion_manifest, map_packet),
        "review_history": _review_history(
            sheet_review_manifest,
            building_manifest,
            suggestion_manifest,
            community_review_manifest,
            teacher_review,
            review_state.get("events", []),
        ),
        "release_gate": _release_gate(teacher_review, building_manifest, suggestion_manifest),
        "community_review": community_review,
        "notes": "Community review improves map accuracy, people/business resolution, and provenance before classroom release.",
    }


def _optional_building_manifest(
    repo_root: Path | None,
    town_slug: str,
    state_root: Path | None,
) -> BuildingManifest | None:
    try:
        return load_building_manifest(repo_root, town_slug, state_root=state_root)
    except MindseyeDataError:
        return None


def _optional_verification_suggestion_manifest(
    repo_root: Path | None,
    town_slug: str,
) -> VerificationSuggestionManifest | None:
    try:
        return load_verification_suggestion_manifest(repo_root, town_slug)
    except MindseyeDataError:
        return None


def _optional_community_review_manifest(
    repo_root: Path | None,
    town_slug: str,
) -> CommunityReviewManifest | None:
    try:
        return load_community_review_manifest(repo_root, town_slug)
    except MindseyeDataError:
        return None


def _optional_sheet_review_manifest(
    repo_root: Path | None,
    town_slug: str,
) -> SanbornSheetReviewManifest | None:
    try:
        return load_sanborn_sheet_review_manifest(repo_root, town_slug)
    except MindseyeDataError:
        return None


def _optional_map_rendering_packet(
    package: TownPackage,
    repo_root: Path | None,
    town_slug: str,
    state_root: Path | None,
) -> dict[str, object] | None:
    try:
        return build_map_rendering_packet(package, repo_root=repo_root, town_slug=town_slug, state_root=state_root)
    except MindseyeDataError:
        return None


def _optional_teacher_review_packet(
    package: TownPackage,
    repo_root: Path | None,
    town_slug: str,
) -> dict[str, object] | None:
    try:
        return build_teacher_approval_packet(package, repo_root=repo_root, town_slug=town_slug)
    except MindseyeDataError:
        return None


def _optional_community_review_packet(
    package: TownPackage,
    repo_root: Path | None,
    town_slug: str,
    state_root: Path | None,
) -> dict[str, object] | None:
    try:
        packet = build_community_review_packet(
            package,
            repo_root=repo_root,
            town_slug=town_slug,
            state_root=state_root,
        )
    except MindseyeDataError:
        return None
    if packet["town_package_id"] != package.package_id:
        return None
    return packet


def _historical_year_gate(package: TownPackage) -> dict[str, object]:
    map_year = _map_year(package)
    return {
        "map_year": map_year,
        "start_year": map_year - 10,
        "end_year": map_year + 10,
        "span_before_years": 10,
        "span_after_years": 10,
        "total_span_years": 20,
        "rule": "Keep community review and source gathering inside a 20-year window centered on the Sanborn map year.",
    }


def _map_year(package: TownPackage) -> int:
    if package.map_layers and isinstance(package.map_layers[0], dict):
        map_year = package.map_layers[0].get("year")
        if isinstance(map_year, int) and not isinstance(map_year, bool):
            return map_year

    start_year = package.time_window.get("start_year")
    if isinstance(start_year, int) and not isinstance(start_year, bool):
        return start_year
    raise MindseyeDataError("town package is missing a usable map year")


def _scope_ladder() -> list[dict[str, object]]:
    return [
        {
            "scope_id": "community",
            "label": "Community",
            "scope_state": "active",
            "notes": "Town-level reviewers verify buildings, people, businesses, roads, labels, and sources.",
        },
        {
            "scope_id": "county",
            "label": "County Manager",
            "scope_state": "planned",
            "notes": "County roll-ups will aggregate multiple towns and review lanes later.",
        },
        {
            "scope_id": "state",
            "label": "State Manager",
            "scope_state": "planned",
            "notes": "State roll-ups will show all towns and lower-level review activity later.",
        },
    ]


def _status_chips(
    package: TownPackage,
    building_manifest: BuildingManifest | None,
    sheet_review_manifest: SanbornSheetReviewManifest | None,
    suggestion_manifest: VerificationSuggestionManifest | None,
    community_review_manifest: CommunityReviewManifest | None,
    map_packet: dict[str, object] | None,
    teacher_review: dict[str, object] | None,
) -> list[dict[str, object]]:
    source_count = len(package.sources)
    building_count = building_manifest.record_count if building_manifest is not None else 0
    candidate_count = suggestion_manifest.candidate_count if suggestion_manifest is not None else 0
    review_people_count = len(community_review_manifest.people) if community_review_manifest is not None else 0
    review_business_count = (
        len(community_review_manifest.businesses) if community_review_manifest is not None else 0
    )
    release_state = "blocked"
    if teacher_review is not None and teacher_review.get("classroom_release_ready"):
        release_state = "ready"

    return [
        {
            "chip_id": "sources-ready",
            "label": "Sources Ready",
            "value": source_count,
            "state": "ready" if source_count else "blocked",
        },
        {
            "chip_id": "sheets-in-review",
            "label": "Sheets in Review",
            "value": sheet_review_manifest.review_count if sheet_review_manifest is not None else _sheet_review_count(map_packet),
            "state": "reviewing" if sheet_review_manifest is not None or map_packet is not None else "blocked",
        },
        {
            "chip_id": "building-identities-partial",
            "label": "Building Identities Partial",
            "value": building_count,
            "state": "partial" if building_count else "blocked",
        },
        {
            "chip_id": "people-businesses-reviewed",
            "label": "People / Businesses",
            "value": review_people_count + review_business_count,
            "state": "reviewing" if (review_people_count + review_business_count) else "blocked",
        },
        {
            "chip_id": "art-layer-guarded",
            "label": "Art Layer Guarded",
            "value": suggestion_count_from_building_manifest(building_manifest, candidate_count),
            "state": "guarded",
        },
        {
            "chip_id": "release-gate",
            "label": "Release Gate",
            "value": release_state,
            "state": release_state,
        },
    ]


def _sheet_review_count(map_packet: dict[str, object] | None) -> int:
    if map_packet is None:
        return 0
    base_layer = map_packet.get("base_map_layer")
    if not isinstance(base_layer, dict):
        return 0
    return 1


def suggestion_count_from_building_manifest(
    building_manifest: BuildingManifest | None,
    candidate_count: int,
) -> int:
    if building_manifest is None:
        return candidate_count
    return max(candidate_count, sum(len(building.suggestion_ids) for building in building_manifest.buildings))


def _workspace_tabs() -> list[dict[str, object]]:
    return [
        {"tab_id": "town-overview", "label": "Town Overview"},
        {"tab_id": "source-intake", "label": "Source Intake"},
        {"tab_id": "sheet-review", "label": "Sheet Review"},
        {"tab_id": "map-layers", "label": "Map Layers"},
        {"tab_id": "building-review", "label": "Building Review"},
        {"tab_id": "candidate-matches", "label": "Candidate Matches"},
        {"tab_id": "claim-review", "label": "Claims"},
        {"tab_id": "people-businesses", "label": "People / Businesses"},
        {"tab_id": "rights", "label": "Rights"},
        {"tab_id": "audit", "label": "Audit"},
    ]


def _navigation_links() -> list[dict[str, object]]:
    return [
        {
            "link_id": "open-map-auditor",
            "label": "Open Map Auditor",
            "href": "#map-auditor",
            "notes": "Review stitched sheets, progress, and georeferencing prep.",
        },
        {
            "link_id": "open-building-auditor",
            "label": "Open Building Auditor",
            "href": "#building-auditor",
            "notes": "Review building anchors, footprints, and art layers.",
        },
        {
            "link_id": "open-people-auditor",
            "label": "Open People Auditor",
            "href": "#people-auditor",
            "notes": "Review people, businesses, and source issue trails.",
        },
    ]


def _review_domains(
    package: TownPackage,
    building_manifest: BuildingManifest | None,
    suggestion_manifest: VerificationSuggestionManifest | None,
    community_review_manifest: CommunityReviewManifest | None,
) -> list[dict[str, object]]:
    building_count = building_manifest.record_count if building_manifest is not None else 0
    suggestion_count = suggestion_manifest.candidate_count if suggestion_manifest is not None else 0
    people_count = len(community_review_manifest.people) if community_review_manifest is not None else 0
    business_count = len(community_review_manifest.businesses) if community_review_manifest is not None else 0
    return [
        {
            "domain_id": "buildings",
            "label": "Buildings",
            "status": "seeded" if building_count else "planned",
            "record_count": building_count,
            "notes": "Review building identity, footprint, and art anchors.",
        },
        {
            "domain_id": "people",
            "label": "People",
            "status": "seeded" if people_count else "planned",
            "record_count": people_count,
            "notes": "Portal, directory, and newspaper person matches are tracked separately from buildings.",
        },
        {
            "domain_id": "businesses",
            "label": "Businesses",
            "status": "seeded" if business_count else "planned",
            "record_count": business_count,
            "notes": "Business identity, ownership, and price clues are tracked separately from buildings.",
        },
        {
            "domain_id": "roads",
            "label": "Roads",
            "status": "planned",
            "record_count": 0,
            "notes": "Street and rail verification should stay separate from building labels.",
        },
        {
            "domain_id": "labels",
            "label": "Labels",
            "status": "seeded",
            "record_count": len(package.locations),
            "notes": "Place labels remain tied to reviewed locations and source support.",
        },
        {
            "domain_id": "sources",
            "label": "Sources",
            "status": "ready",
            "record_count": len(package.sources),
            "notes": "Source intake, citation trails, and source-rights notes belong here.",
        },
        {
            "domain_id": "claims",
            "label": "Claims",
            "status": "ready",
            "record_count": len(package.claims),
            "notes": "Claims remain labeled as verified, inferred, or fictional.",
        },
        {
            "domain_id": "candidates",
            "label": "Candidate Matches",
            "status": "guarded",
            "record_count": suggestion_count,
            "notes": "Potential Portal to Texas History, directory, and newspaper matches stay in review until confirmed.",
        },
        {
            "domain_id": "telegrams",
            "label": "Telegram Review",
            "status": "planned",
            "record_count": 0,
            "notes": "Future communication review lane for teacher and community use.",
        },
        {
            "domain_id": "postal",
            "label": "Postal Review",
            "status": "planned",
            "record_count": 0,
            "notes": "Future postal evidence lane for person, place, and route matching.",
        },
        {
            "domain_id": "train_schedules",
            "label": "Train Schedules",
            "status": "planned",
            "record_count": 0,
            "notes": "Rail timing and freight context can be reviewed later.",
        },
        {
            "domain_id": "prices",
            "label": "Prices",
            "status": "planned",
            "record_count": 0,
            "notes": "Historical price and commerce data can be added later.",
        },
        {
            "domain_id": "rights",
            "label": "Rights",
            "status": "planned",
            "record_count": 0,
            "notes": "Source rights, publication permissions, and usage notes belong here.",
        },
        {
            "domain_id": "audit",
            "label": "Audit",
            "status": "planned",
            "record_count": 0,
            "notes": "Review history and promotion logs live here.",
        },
    ]


def _entity_review_panels(
    package: TownPackage,
    building_manifest: BuildingManifest | None,
    suggestion_manifest: VerificationSuggestionManifest | None,
    community_review_manifest: CommunityReviewManifest | None,
    community_review: dict[str, object] | None,
) -> dict[str, object]:
    building_records = []
    if building_manifest is not None:
        building_records = [
            {
                "building_id": building.building_id,
                "location_id": building.location_id,
                "reviewed_label": building.reviewed_label,
                "identity_status": building.identity_status,
                "visual_detail_status": building.visual_detail_status,
                "student_safe_name": building.student_safe_name,
                "source_ids": list(building.source_ids),
                "review_record_id": building.review_record_id,
            }
            for building in building_manifest.buildings
        ]

    suggestion_records = []
    if suggestion_manifest is not None:
        suggestion_records = [
            {
                "suggestion_id": suggestion.suggestion_id,
                "suggestion_type": suggestion.suggestion_type,
                "candidate_label": suggestion.candidate_label,
                "status": suggestion.status,
                "confidence": suggestion.confidence,
                "historical_basis": suggestion.historical_basis,
                "source_ids": list(suggestion.source_ids),
            }
            for suggestion in suggestion_manifest.suggestions
        ]

    people_records = _community_review_records(community_review, "people")
    business_records = _community_review_records(community_review, "businesses")

    return {
        "buildings": building_records,
        "people": people_records,
        "businesses": business_records,
        "candidates": suggestion_records,
        "community_review_manifest_id": community_review_manifest.community_review_manifest_id if community_review_manifest is not None else None,
        "map_year_gate": _historical_year_gate(package),
    }


def _evidence_inspector(
    package: TownPackage,
    building_manifest: BuildingManifest | None,
    suggestion_manifest: VerificationSuggestionManifest | None,
    map_packet: dict[str, object] | None,
) -> dict[str, object]:
    focus = None
    if building_manifest is not None and building_manifest.buildings:
        building = building_manifest.buildings[0]
        if building.visual_detail_status == "verified":
            confidence = 92
            historical_basis = "verified_fact"
        elif building.visual_detail_status == "inferred":
            confidence = 68
            historical_basis = "source_based_inference"
        else:
            confidence = 34
            historical_basis = "fictional_gameplay"

        focus = {
            "focus_type": "building_record",
            "focus_label": "Building Identity",
            "focus_id": building.building_id,
            "label": building.reviewed_label or building.student_safe_name,
            "status": building.identity_status,
            "source_ids": list(building.source_ids),
            "confidence": confidence,
            "historical_basis": historical_basis,
            "visual_detail_status": building.visual_detail_status,
            "notes": building.notes,
            "related_location": {
                "location_id": building.location_id,
                "label": next(
                    (location.label for location in package.locations if location.location_id == building.location_id),
                    building.location_id,
                ),
                "street": next(
                    (location.street for location in package.locations if location.location_id == building.location_id),
                    "",
                ),
                "certainty": next(
                    (location.certainty for location in package.locations if location.location_id == building.location_id),
                    "",
                ),
            },
        }
    elif suggestion_manifest is not None and suggestion_manifest.suggestions:
        suggestion = suggestion_manifest.suggestions[0]
        focus = {
            "focus_type": "candidate_match",
            "focus_label": "Candidate Match",
            "focus_id": suggestion.suggestion_id,
            "label": suggestion.candidate_label,
            "status": suggestion.status,
            "source_ids": list(suggestion.source_ids),
            "confidence": suggestion.confidence,
            "historical_basis": suggestion.historical_basis,
            "notes": suggestion.review_notes,
        }
    else:
        first_location = package.locations[0] if package.locations else None
        focus = {
            "focus_type": "location_record",
            "focus_label": "Location Record",
            "focus_id": first_location.location_id if first_location is not None else "unavailable",
            "label": first_location.label if first_location is not None else "No reviewed location yet",
            "status": first_location.certainty if first_location is not None else "blocked",
            "source_ids": list(first_location.source_ids) if first_location is not None else [],
            "notes": first_location.notes if first_location is not None else "",
        }

    return {
        "focus": focus,
        "map_layer_id": map_packet["base_map_layer"]["layer_id"] if map_packet is not None else "unavailable",
        "selected_scope": "community",
        "selected_town": package.town_name,
    }


def _review_history(
    sheet_review_manifest: SanbornSheetReviewManifest | None,
    building_manifest: BuildingManifest | None,
    suggestion_manifest: VerificationSuggestionManifest | None,
    community_review_manifest: CommunityReviewManifest | None,
    teacher_review: dict[str, object] | None,
    review_events: list[dict[str, object]] | None = None,
) -> list[dict[str, object]]:
    history = []
    if sheet_review_manifest is not None:
        history.append(
            {
                "event_id": "sheet-review-loaded",
                "label": "Sanborn sheet review loaded",
                "status": sheet_review_manifest.claim_generation_status,
                "notes": sheet_review_manifest.review_scope,
            }
        )
    if building_manifest is not None:
        history.append(
            {
                "event_id": "buildings-loaded",
                "label": "Building review records loaded",
                "status": building_manifest.building_identity_status,
                "notes": building_manifest.title,
            }
        )
    if suggestion_manifest is not None:
        history.append(
            {
                "event_id": "candidates-loaded",
                "label": "Candidate matches queued",
                "status": suggestion_manifest.review_queue_status,
                "notes": suggestion_manifest.promotion_rule,
            }
        )
    if community_review_manifest is not None:
        history.append(
            {
                "event_id": "community-review-loaded",
                "label": "Community review records loaded",
                "status": community_review_manifest.review_queue_status,
                "notes": community_review_manifest.promotion_rule,
            }
        )
    if teacher_review is not None:
        history.append(
            {
                "event_id": "teacher-release",
                "label": "Teacher release gate",
                "status": "ready" if teacher_review.get("classroom_release_ready") else "blocked",
                "notes": teacher_review.get("teacher_authority_rule", ""),
            }
        )
    if review_events:
        history.extend(history_items_from_events(review_events))
    return history


def _community_review_records(raw_review: dict[str, object] | None, key: str) -> list[dict[str, object]]:
    if raw_review is None:
        return []
    records = raw_review.get(key)
    if not isinstance(records, list):
        return []

    normalized: list[dict[str, object]] = []
    for raw_record in records:
        if not isinstance(raw_record, dict):
            continue
        normalized.append(
            {
                "review_record_id": raw_record.get("review_record_id", ""),
                "entity_type": raw_record.get("entity_type", ""),
                "entity_id": raw_record.get("entity_id", ""),
                "display_name": raw_record.get("display_name", ""),
                "review_status": raw_record.get("review_status", ""),
                "historical_basis": raw_record.get("historical_basis", ""),
                "source_ids": list(raw_record.get("source_ids", []))
                if isinstance(raw_record.get("source_ids"), list)
                else [],
                "source_issue_id": raw_record.get("source_issue_id", ""),
                "source_issue": _source_issue_summary(raw_record.get("source_issue")),
                "related_location_ids": list(raw_record.get("related_location_ids", []))
                if isinstance(raw_record.get("related_location_ids"), list)
                else [],
                "notes": raw_record.get("notes", ""),
            }
        )
    return normalized


def _source_issue_summary(raw_issue: object) -> dict[str, object]:
    if not isinstance(raw_issue, dict):
        return {
            "source_issue_id": "",
            "source_id": "",
            "publication_title": "",
            "issue_date": "",
            "volume": "",
            "number": "",
            "edition": "",
            "page": "",
            "page_url": "",
            "citation": "",
            "ocr_excerpt": "",
            "notes": "",
        }

    return {
        "source_issue_id": raw_issue.get("source_issue_id", ""),
        "source_id": raw_issue.get("source_id", ""),
        "publication_title": raw_issue.get("publication_title", ""),
        "issue_date": raw_issue.get("issue_date", ""),
        "volume": raw_issue.get("volume", ""),
        "number": raw_issue.get("number", ""),
        "edition": raw_issue.get("edition", ""),
        "page": raw_issue.get("page", ""),
        "page_url": raw_issue.get("page_url", ""),
        "citation": raw_issue.get("citation", ""),
        "ocr_excerpt": raw_issue.get("ocr_excerpt", ""),
        "notes": raw_issue.get("notes", ""),
    }


def _release_gate(
    teacher_review: dict[str, object] | None,
    building_manifest: BuildingManifest | None,
    suggestion_manifest: VerificationSuggestionManifest | None,
) -> dict[str, object]:
    if teacher_review is not None and teacher_review.get("classroom_release_ready"):
        return {
            "state": "ready",
            "reason": "Teacher review is approved and the community review lane is not holding a release blocker.",
        }

    blockers = []
    if building_manifest is not None and building_manifest.building_identity_status != "reviewed_subset_available":
        blockers.append("building_identity_status")
    if suggestion_manifest is not None and suggestion_manifest.review_queue_status not in {"seed_only", "open"}:
        blockers.append("candidate_queue")

    return {
        "state": "blocked",
        "reason": "Community review remains upstream of classroom release.",
        "blockers": blockers,
    }
