from __future__ import annotations

from pathlib import Path

from .community_review import build_community_review_packet
from .models import MindseyeDataError, TownPackage
from .review_state import history_items_from_events, load_review_state
from .teacher_review import build_teacher_approval_packet


def build_people_auditor_packet(
    package: TownPackage,
    repo_root: Path | None = None,
    town_slug: str = "texarkana",
    state_root: Path | None = None,
) -> dict[str, object]:
    """Build the dedicated people and business review contract."""
    review_packet = _optional_community_review_packet(package, repo_root, town_slug, state_root=state_root)
    teacher_review = _optional_teacher_review_packet(package, repo_root, town_slug)
    review_state = load_review_state(state_root)

    people_records = list(review_packet["people"]) if review_packet is not None else []
    business_records = list(review_packet["businesses"]) if review_packet is not None else []
    source_issues = list(review_packet["source_issues"]) if review_packet is not None else []

    selected_issue = _selected_issue(source_issues, people_records, business_records)
    selected_person = _selected_person(people_records)
    selected_business = _selected_business(business_records)

    return {
        "dashboard_id": f"people_auditor_{package.package_id}",
        "dashboard_title": f"{package.town_name} People Auditor",
        "town_package_id": package.package_id,
        "town_name": package.town_name,
        "state_region": package.state_region,
        "year_gate": _historical_year_gate(package),
        "navigation_links": _navigation_links(),
        "community_review_manifest_id": review_packet["community_review_manifest_id"] if review_packet is not None else "",
        "manifest_type": "town_community_review_manifest" if review_packet is not None else "",
        "review_queue_status": review_packet["review_queue_status"] if review_packet is not None else "unavailable",
        "promotion_rule": review_packet["promotion_rule"] if review_packet is not None else "",
        "record_count": review_packet["record_count"] if review_packet is not None else 0,
        "source_issue_count": review_packet["source_issue_count"] if review_packet is not None else 0,
        "review_scope": {
            "community_review_manifest_id": review_packet["community_review_manifest_id"] if review_packet is not None else "",
            "manifest_type": "town_community_review_manifest" if review_packet is not None else "",
            "review_queue_status": review_packet["review_queue_status"] if review_packet is not None else "unavailable",
            "promotion_rule": review_packet["promotion_rule"] if review_packet is not None else "",
            "record_count": review_packet["record_count"] if review_packet is not None else 0,
            "source_issue_count": review_packet["source_issue_count"] if review_packet is not None else 0,
        },
        "claim_boundary": dict(review_packet["claim_boundary"]) if review_packet is not None else {},
        "status_chips": _status_chips(review_packet, teacher_review),
        "progress_summary": _progress_summary(people_records, business_records, source_issues),
        "source_issue_browser": _source_issue_browser(source_issues, people_records, business_records),
        "selected_issue": selected_issue,
        "people_review": people_records,
        "selected_person": selected_person,
        "businesses_review": business_records,
        "selected_business": selected_business,
        "review_scope": dict(review_packet["claim_boundary"]) if review_packet is not None else {},
        "review_legend": _review_legend(people_records, business_records),
        "review_history": _review_history(review_packet, teacher_review, review_state.get("events", [])),
        "unresolved_summary": _unresolved_summary(people_records, business_records, source_issues),
        "quick_actions": _quick_actions(),
        "notes": "People and businesses stay separate from map geometry until reviewers promote them.",
    }


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


def _optional_teacher_review_packet(
    package: TownPackage,
    repo_root: Path | None,
    town_slug: str,
) -> dict[str, object] | None:
    try:
        packet = build_teacher_approval_packet(package, repo_root=repo_root, town_slug=town_slug)
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
        "rule": "Keep people, business, and source review inside a 20-year window centered on the Sanborn map year.",
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


def _navigation_links() -> list[dict[str, object]]:
    return [
        {"link_id": "return-community", "label": "Back to Community", "href": "#community-dashboard"},
        {"link_id": "open-map-auditor", "label": "Open Map Auditor", "href": "#map-auditor"},
        {"link_id": "open-building-auditor", "label": "Open Building Auditor", "href": "#building-auditor"},
    ]


def _status_chips(
    review_packet: dict[str, object] | None,
    teacher_review: dict[str, object] | None,
) -> list[dict[str, object]]:
    people_records = list(review_packet["people"]) if review_packet is not None else []
    business_records = list(review_packet["businesses"]) if review_packet is not None else []
    source_issue_count = len(review_packet["source_issues"]) if review_packet is not None else 0
    review_queue_status = review_packet["review_queue_status"] if review_packet is not None else "unavailable"
    under_review = _status_count(people_records + business_records, "under_review")
    confirmed = _status_count(people_records + business_records, "confirmed")
    rejected = _status_count(people_records + business_records, "rejected")
    release_state = "blocked"
    if teacher_review is not None and teacher_review.get("classroom_release_ready"):
        release_state = "ready"

    return [
        {"chip_id": "queue-status", "label": "Queue", "value": review_queue_status, "state": review_queue_status},
        {
            "chip_id": "people-records",
            "label": "People Records",
            "value": len(people_records),
            "state": "reviewing" if people_records else "blocked",
        },
        {
            "chip_id": "business-records",
            "label": "Business Records",
            "value": len(business_records),
            "state": "reviewing" if business_records else "blocked",
        },
        {
            "chip_id": "source-issues",
            "label": "Source Issues",
            "value": source_issue_count,
            "state": "reviewing" if source_issue_count else "blocked",
        },
        {"chip_id": "under-review", "label": "Under Review", "value": under_review, "state": "reviewing"},
        {"chip_id": "confirmed", "label": "Confirmed", "value": confirmed, "state": "ready" if confirmed else "blocked"},
        {"chip_id": "rejected", "label": "Rejected", "value": rejected, "state": "blocked" if rejected else "reviewing"},
        {"chip_id": "release-gate", "label": "Release Gate", "value": release_state, "state": release_state},
    ]


def _progress_summary(
    people_records: list[dict[str, object]],
    business_records: list[dict[str, object]],
    source_issues: list[dict[str, object]],
) -> dict[str, object]:
    total_records = len(people_records) + len(business_records)
    resolved_count = _status_count(people_records + business_records, "confirmed") + _status_count(
        people_records + business_records, "rejected"
    )
    under_review_count = _status_count(people_records + business_records, "under_review")
    unresolved_count = max(total_records - resolved_count, 0)

    return {
        "overall_percent": int(round((resolved_count / total_records) * 100)) if total_records else 0,
        "people_total": len(people_records),
        "business_total": len(business_records),
        "source_issue_total": len(source_issues),
        "resolved_total": resolved_count,
        "under_review_total": under_review_count,
        "unresolved_total": unresolved_count,
        "segments": [
            {
                "label": "People",
                "value": str(len(people_records)),
                "percent": int(round((len(people_records) / max(total_records, 1)) * 100)) if total_records else 0,
            },
            {
                "label": "Businesses",
                "value": str(len(business_records)),
                "percent": int(round((len(business_records) / max(total_records, 1)) * 100)) if total_records else 0,
            },
            {
                "label": "Source Issues",
                "value": str(len(source_issues)),
                "percent": 100 if source_issues else 0,
            },
            {
                "label": "Resolved",
                "value": f"{resolved_count}/{total_records}" if total_records else "0/0",
                "percent": int(round((resolved_count / total_records) * 100)) if total_records else 0,
            },
            {
                "label": "Needs Review",
                "value": str(under_review_count),
                "percent": int(round((under_review_count / total_records) * 100)) if total_records else 0,
            },
        ],
    }


def _source_issue_browser(
    source_issues: list[dict[str, object]],
    people_records: list[dict[str, object]],
    business_records: list[dict[str, object]],
) -> list[dict[str, object]]:
    people_by_issue: dict[str, list[str]] = {}
    businesses_by_issue: dict[str, list[str]] = {}
    for person in people_records:
        issue_id = str(person.get("source_issue_id", ""))
        people_by_issue.setdefault(issue_id, []).append(str(person.get("display_name", "")))
    for business in business_records:
        issue_id = str(business.get("source_issue_id", ""))
        businesses_by_issue.setdefault(issue_id, []).append(str(business.get("display_name", "")))

    browser = []
    for issue in source_issues:
        issue_id = str(issue.get("source_issue_id", ""))
        linked_people = people_by_issue.get(issue_id, [])
        linked_businesses = businesses_by_issue.get(issue_id, [])
        browser.append(
            {
                "source_issue_id": issue_id,
                "source_id": issue.get("source_id", ""),
                "publication_title": issue.get("publication_title", ""),
                "issue_date": issue.get("issue_date", ""),
                "page": issue.get("page", ""),
                "citation": issue.get("citation", ""),
                "ocr_excerpt": issue.get("ocr_excerpt", ""),
                "notes": issue.get("notes", ""),
                "linked_people_count": len(linked_people),
                "linked_business_count": len(linked_businesses),
                "linked_record_count": len(linked_people) + len(linked_businesses),
                "linked_people_names": linked_people,
                "linked_business_names": linked_businesses,
            }
        )
    return browser


def _selected_issue(
    source_issues: list[dict[str, object]],
    people_records: list[dict[str, object]],
    business_records: list[dict[str, object]],
) -> dict[str, object] | None:
    if not source_issues:
        return None

    browser = _source_issue_browser(source_issues, people_records, business_records)
    browser.sort(key=lambda item: (-int(item["linked_record_count"]), str(item["issue_date"])))
    return browser[0]


def _selected_person(people_records: list[dict[str, object]]) -> dict[str, object] | None:
    if not people_records:
        return None

    for record in people_records:
        if record.get("review_status") == "under_review":
            return record
    return people_records[0]


def _selected_business(business_records: list[dict[str, object]]) -> dict[str, object] | None:
    if not business_records:
        return None

    for record in business_records:
        if record.get("review_status") in {"confirmed", "under_review"}:
            return record
    return business_records[0]


def _review_legend(
    people_records: list[dict[str, object]],
    business_records: list[dict[str, object]],
) -> list[dict[str, object]]:
    records = people_records + business_records
    return [
        {
            "label": "Verified Fact",
            "status": "verified",
            "count": _basis_count(records, "verified_fact"),
            "notes": "Directly supported by the cited source issue.",
        },
        {
            "label": "Source-Based Inference",
            "status": "inferred",
            "count": _basis_count(records, "source_based_inference"),
            "notes": "Reasonable interpretation that still needs human review.",
        },
        {
            "label": "Fictional Gameplay",
            "status": "fictional",
            "count": _basis_count(records, "fictional_gameplay"),
            "notes": "Only for game logic, never for historical identity claims.",
        },
        {
            "label": "Under Review",
            "status": "reviewing",
            "count": _status_count(records, "under_review"),
            "notes": "A reviewer has not yet promoted the record.",
        },
        {
            "label": "Confirmed",
            "status": "confirmed",
            "count": _status_count(records, "confirmed"),
            "notes": "The record has been accepted by a reviewer.",
        },
        {
            "label": "Rejected",
            "status": "rejected",
            "count": _status_count(records, "rejected"),
            "notes": "The record was reviewed and not accepted.",
        },
    ]


def _review_history(
    review_packet: dict[str, object] | None,
    teacher_review: dict[str, object] | None,
    review_events: list[dict[str, object]] | None = None,
) -> list[dict[str, object]]:
    history: list[dict[str, object]] = []
    if review_packet is not None:
        history.append(
            {
                "event_id": "issue-adapter-loaded",
                "label": "Source issue adapter loaded",
                "status": review_packet["review_queue_status"],
                "notes": review_packet["promotion_rule"],
            }
        )
        history.append(
            {
                "event_id": "people-records-loaded",
                "label": "People records loaded",
                "status": len(review_packet["people"]),
                "notes": "People remain separated from building and map review lanes.",
            }
        )
        history.append(
            {
                "event_id": "business-records-loaded",
                "label": "Business records loaded",
                "status": len(review_packet["businesses"]),
                "notes": "Business records stay linked to the issue trail until confirmed.",
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


def _unresolved_summary(
    people_records: list[dict[str, object]],
    business_records: list[dict[str, object]],
    source_issues: list[dict[str, object]],
) -> list[dict[str, object]]:
    records = people_records + business_records
    records_without_location = sum(1 for record in records if not record.get("related_location_ids"))
    source_issue_ids = {str(issue.get("source_issue_id", "")) for issue in source_issues}
    used_issue_ids = {str(record.get("source_issue_id", "")) for record in records}
    issues_without_records = len(source_issue_ids - used_issue_ids)

    return [
        {"label": "People under review", "count": _status_count(people_records, "under_review")},
        {"label": "Businesses under review", "count": _status_count(business_records, "under_review")},
        {"label": "Records without location links", "count": records_without_location},
        {"label": "Rejected records", "count": _status_count(records, "rejected")},
        {"label": "Source issues without records", "count": issues_without_records},
    ]


def _quick_actions() -> list[dict[str, object]]:
    return [
        {"action_id": "link_source_issue", "label": "Link Source Issue", "kind": "secondary"},
        {"action_id": "promote_record", "label": "Promote Selected Record", "kind": "primary"},
        {"action_id": "needs_more_evidence", "label": "Needs More Evidence", "kind": "secondary"},
        {"action_id": "reject_record", "label": "Reject Record", "kind": "danger"},
        {"action_id": "return_community", "label": "Return to Community", "kind": "primary", "href": "#community-dashboard"},
        {"action_id": "open_map_auditor", "label": "Open Map Auditor", "kind": "primary", "href": "#map-auditor"},
        {"action_id": "open_building_auditor", "label": "Open Building Auditor", "kind": "primary", "href": "#building-auditor"},
    ]


def _status_count(records: list[dict[str, object]], status: str) -> int:
    return sum(1 for record in records if record.get("review_status") == status)


def _basis_count(records: list[dict[str, object]], basis: str) -> int:
    return sum(1 for record in records if record.get("historical_basis") == basis)
