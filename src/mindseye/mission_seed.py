from __future__ import annotations

from .models import ClaimRecord, ClaimType, LocationRecord, TownPackage
from .provenance import (
    claims_for_mission,
    locations_for_mission,
    lookup_mission_seed,
    mission_citation_trail,
    mission_map_trail,
    teacher_claim_summary,
)


def build_mission_seed_packet(package: TownPackage, mission_id: str | None = None) -> dict[str, object]:
    """Build a mission packet from existing package records only.

    This is not a gameplay system or AI generator. It only resolves the mission
    seed's existing claim, location, and source links into a reviewable packet.
    """
    resolved_mission_id = mission_id or package.mission_seed.mission_id
    mission = lookup_mission_seed(package, resolved_mission_id)
    selected_claims = claims_for_mission(package, resolved_mission_id)
    selected_locations = locations_for_mission(package, resolved_mission_id)
    citation_trail = mission_citation_trail(package, resolved_mission_id)
    map_trail = mission_map_trail(package, resolved_mission_id)

    historical_claims = tuple(
        claim for claim in selected_claims if claim.claim_type != ClaimType.FICTIONAL_GAMEPLAY
    )
    fictional_claims = tuple(
        claim for claim in selected_claims if claim.claim_type == ClaimType.FICTIONAL_GAMEPLAY
    )

    return {
        "mission_id": mission.mission_id,
        "title": mission.title,
        "town_package_id": mission.town_package_id,
        "teacher_goal": mission.teacher_goal,
        "student_hook": mission.student_hook,
        "student_mission_hook": {
            "text": mission.student_hook,
            "provenance_labels": _student_provenance_labels(selected_claims),
        },
        "teacher_notes": mission.teacher_notes,
        "teacher_source_notes": _teacher_source_notes(citation_trail),
        "locations": [_location_summary(location) for location in selected_locations],
        "claim_locations": map_trail,
        "claims": teacher_claim_summary(tuple(selected_claims)),
        "historical_claims": teacher_claim_summary(historical_claims),
        "fictional_claims": teacher_claim_summary(fictional_claims),
        "fictional_elements": list(mission.fictional_elements),
        "classroom_ready": False,
        "readiness_reason": _readiness_reason(package),
    }


def build_teacher_review_packet(package: TownPackage) -> dict[str, object]:
    """Compatibility wrapper for the first teacher-review packet API."""
    return build_mission_seed_packet(package)


def _location_summary(location: LocationRecord) -> dict[str, object]:
    return {
        "location_id": location.location_id,
        "label": location.label,
        "map_id": location.map_id,
        "certainty": location.certainty,
        "source_ids": list(location.source_ids),
    }


def _student_provenance_labels(claims: tuple[ClaimRecord, ...]) -> list[dict[str, str]]:
    return [
        {
            "claim_id": claim.claim_id,
            "claim_type": claim.claim_type.value,
            "confidence": claim.confidence.value,
        }
        for claim in claims
        if claim.student_visible
    ]


def _teacher_source_notes(citation_trail: list[dict[str, object]]) -> list[dict[str, object]]:
    return [
        item
        for item in citation_trail
        if item["claim_type"] in {ClaimType.VERIFIED_FACT.value, ClaimType.SOURCE_BASED_INFERENCE.value}
    ]


def _readiness_reason(package: TownPackage) -> str:
    if any(location.certainty == "placeholder" for location in package.locations):
        return "Placeholder location records require teacher review before classroom use."
    return "Teacher review required before classroom use."
