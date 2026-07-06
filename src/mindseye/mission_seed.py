from __future__ import annotations

from .models import MindseyeDataError, TownPackage
from .provenance import teacher_claim_summary


def build_teacher_review_packet(package: TownPackage) -> dict[str, object]:
    """Create the first safe output shape for a teacher-reviewed mission.

    This is not a full AI mission generator. It is the contract that a future
    generator must satisfy before students see a mission.
    """
    mission = package.mission_seed
    claims_by_id = {claim.claim_id: claim for claim in package.claims}
    locations_by_id = {location.location_id: location for location in package.locations}

    selected_claims = []
    for claim_id in mission.claim_ids:
        claim = claims_by_id.get(claim_id)
        if claim is None:
            raise MindseyeDataError(f"mission references missing claim: {claim_id}")
        selected_claims.append(claim)

    selected_locations = []
    for location_id in mission.location_ids:
        location = locations_by_id.get(location_id)
        if location is None:
            raise MindseyeDataError(f"mission references missing location: {location_id}")
        selected_locations.append(
            {
                "location_id": location.location_id,
                "label": location.label,
                "map_id": location.map_id,
                "certainty": location.certainty,
                "source_ids": list(location.source_ids),
            }
        )

    return {
        "mission_id": mission.mission_id,
        "title": mission.title,
        "town_package_id": mission.town_package_id,
        "teacher_goal": mission.teacher_goal,
        "student_hook": mission.student_hook,
        "teacher_notes": mission.teacher_notes,
        "locations": selected_locations,
        "claims": teacher_claim_summary(tuple(selected_claims)),
        "fictional_elements": list(mission.fictional_elements),
        "classroom_ready": False,
        "readiness_reason": "Placeholder sources and claims must be replaced or approved before classroom use.",
    }
