from __future__ import annotations

from .instructional_alignment import load_instructional_alignment_manifest
from .mission_seed import build_mission_seed_packet
from .models import ClaimType, MindseyeDataError, TownPackage


def build_classroom_readiness_report(package: TownPackage, mission_id: str | None = None) -> dict[str, object]:
    """Return a teacher-facing readiness report for one mission packet.

    The report is deliberately conservative. It does not approve gameplay or
    generate new content; it only summarizes whether the existing mission packet
    is ready for teacher review and which blockers remain.
    """
    mission_packet = build_mission_seed_packet(package, mission_id)
    checks = [
        _link_integrity_check(mission_packet),
        _historical_source_notes_check(mission_packet),
        _provenance_labels_check(mission_packet),
        _fictional_separation_check(mission_packet),
        _placeholder_locations_check(mission_packet),
        _instructional_alignment_check(mission_packet),
    ]
    blockers = [check for check in checks if not check["passed"] and check["severity"] == "blocker"]

    return {
        "mission_id": mission_packet["mission_id"],
        "town_package_id": mission_packet["town_package_id"],
        "classroom_ready": not blockers,
        "checks": checks,
        "blockers": blockers,
        "summary": _summary_for(blockers),
    }


def _link_integrity_check(mission_packet: dict[str, object]) -> dict[str, object]:
    return _check(
        check_id="mission_link_integrity",
        passed=True,
        severity="blocker",
        summary="Mission claim, location, and source links resolve through the existing loader/provenance APIs.",
    )


def _historical_source_notes_check(mission_packet: dict[str, object]) -> dict[str, object]:
    historical_claims = _list_of_dicts(mission_packet["historical_claims"])
    source_notes = _list_of_dicts(mission_packet["teacher_source_notes"])
    notes_by_claim_id = {str(note["claim_id"]): note for note in source_notes}

    missing_notes = []
    missing_citations = []
    for claim in historical_claims:
        claim_id = str(claim["claim_id"])
        note = notes_by_claim_id.get(claim_id)
        if note is None:
            missing_notes.append(claim_id)
            continue
        sources = _list_of_dicts(note["sources"])
        if not sources or any(not str(source.get("citation", "")).strip() for source in sources):
            missing_citations.append(claim_id)

    passed = not missing_notes and not missing_citations
    details = {
        "historical_claim_ids": [str(claim["claim_id"]) for claim in historical_claims],
        "missing_source_note_claim_ids": missing_notes,
        "missing_citation_claim_ids": missing_citations,
    }
    summary = "Historical claims have teacher-facing source notes and citations."
    if not passed:
        summary = "Historical claims need teacher-facing source notes and citations before classroom use."

    return _check(
        check_id="historical_source_notes",
        passed=passed,
        severity="blocker",
        summary=summary,
        details=details,
    )


def _provenance_labels_check(mission_packet: dict[str, object]) -> dict[str, object]:
    claims = _list_of_dicts(mission_packet["claims"])
    missing_labels = [
        str(claim.get("claim_id", "unknown"))
        for claim in claims
        if not str(claim.get("claim_type", "")).strip() or not str(claim.get("confidence", "")).strip()
    ]

    return _check(
        check_id="provenance_labels_visible",
        passed=not missing_labels,
        severity="blocker",
        summary="All mission claims expose claim type and confidence labels."
        if not missing_labels
        else "Some mission claims are missing claim type or confidence labels.",
        details={"missing_label_claim_ids": missing_labels},
    )


def _fictional_separation_check(mission_packet: dict[str, object]) -> dict[str, object]:
    historical_claims = _list_of_dicts(mission_packet["historical_claims"])
    fictional_claims = _list_of_dicts(mission_packet["fictional_claims"])
    misplaced_historical = [
        str(claim["claim_id"])
        for claim in historical_claims
        if claim["claim_type"] == ClaimType.FICTIONAL_GAMEPLAY.value
    ]
    misplaced_fiction = [
        str(claim["claim_id"])
        for claim in fictional_claims
        if claim["claim_type"] != ClaimType.FICTIONAL_GAMEPLAY.value
    ]
    passed = not misplaced_historical and not misplaced_fiction

    return _check(
        check_id="fictional_gameplay_separated",
        passed=passed,
        severity="blocker",
        summary="Fictional gameplay claims are separated from historical claims."
        if passed
        else "Fictional gameplay claims are mixed with historical claims.",
        details={
            "misplaced_historical_claim_ids": misplaced_historical,
            "misplaced_fictional_claim_ids": misplaced_fiction,
        },
    )


def _placeholder_locations_check(mission_packet: dict[str, object]) -> dict[str, object]:
    locations = _list_of_dicts(mission_packet["locations"])
    placeholder_location_ids = [
        str(location["location_id"])
        for location in locations
        if str(location.get("certainty", "")).lower() == "placeholder"
    ]

    return _check(
        check_id="placeholder_locations",
        passed=not placeholder_location_ids,
        severity="blocker",
        summary="No placeholder map/location records remain."
        if not placeholder_location_ids
        else "Placeholder map/location records require teacher review before classroom use.",
        details={"placeholder_location_ids": placeholder_location_ids},
    )


def _instructional_alignment_check(mission_packet: dict[str, object]) -> dict[str, object]:
    try:
        manifest = load_instructional_alignment_manifest()
    except MindseyeDataError as exc:
        return _check(
            check_id="instructional_alignment",
            passed=False,
            severity="blocker",
            summary="Instructional alignment contract is missing or invalid.",
            details={"error": str(exc)},
        )

    pending_alignment_ids = [
        alignment.alignment_id
        for alignment in manifest.alignments
        if alignment.framework == "TEKS" and alignment.alignment_status != "reviewed"
    ]
    passed = (
        manifest.town_package_id == str(mission_packet["town_package_id"])
        and manifest.mission_id == str(mission_packet["mission_id"])
        and manifest.teks_status == "approved_for_mission_use"
        and not pending_alignment_ids
    )

    summary = "Instructional alignment includes teacher-approved HQIM and standards targets."
    if not passed:
        summary = "Instructional alignment still needs teacher-reviewed standards selection before classroom use."

    return _check(
        check_id="instructional_alignment",
        passed=passed,
        severity="blocker",
        summary=summary,
        details={
            "instructional_manifest_id": manifest.instructional_manifest_id,
            "hqim_status": manifest.hqim_status,
            "teks_status": manifest.teks_status,
            "pending_alignment_ids": pending_alignment_ids,
        },
    )


def _check(
    check_id: str,
    passed: bool,
    severity: str,
    summary: str,
    details: dict[str, object] | None = None,
) -> dict[str, object]:
    return {
        "check_id": check_id,
        "passed": passed,
        "severity": severity,
        "summary": summary,
        "details": details or {},
    }


def _summary_for(blockers: list[dict[str, object]]) -> str:
    if not blockers:
        return "Mission packet passes the current teacher-facing readiness checks."
    return "Mission packet needs teacher review before classroom use."


def _list_of_dicts(value: object) -> list[dict[str, object]]:
    if not isinstance(value, list) or any(not isinstance(item, dict) for item in value):
        raise TypeError("readiness report expected a list of dictionaries")
    return value
