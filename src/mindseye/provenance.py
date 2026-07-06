from __future__ import annotations

from collections import defaultdict

from .models import (
    ClaimRecord,
    ClaimType,
    Confidence,
    LocationRecord,
    MindseyeDataError,
    MissionSeed,
    SourceRecord,
    TownPackage,
)


def claims_by_type(claims: tuple[ClaimRecord, ...]) -> dict[ClaimType, list[ClaimRecord]]:
    grouped: dict[ClaimType, list[ClaimRecord]] = defaultdict(list)
    for claim in claims:
        grouped[claim.claim_type].append(claim)
    return dict(grouped)


def lookup_source(package: TownPackage, source_id: str) -> SourceRecord:
    for source in package.sources:
        if source.source_id == source_id:
            return source
    raise MindseyeDataError(f"missing source: {source_id}")


def lookup_location(package: TownPackage, location_id: str) -> LocationRecord:
    for location in package.locations:
        if location.location_id == location_id:
            return location
    raise MindseyeDataError(f"missing location: {location_id}")


def lookup_claim(package: TownPackage, claim_id: str) -> ClaimRecord:
    for claim in package.claims:
        if claim.claim_id == claim_id:
            return claim
    raise MindseyeDataError(f"missing claim: {claim_id}")


def lookup_mission_seed(package: TownPackage, mission_id: str) -> MissionSeed:
    for mission_seed in package.mission_seeds:
        if mission_seed.mission_id == mission_id:
            return mission_seed
    raise MindseyeDataError(f"missing mission seed: {mission_id}")


def claims_for_mission(package: TownPackage, mission_id: str) -> tuple[ClaimRecord, ...]:
    mission_seed = lookup_mission_seed(package, mission_id)
    return tuple(lookup_claim(package, claim_id) for claim_id in mission_seed.claim_ids)


def locations_for_mission(package: TownPackage, mission_id: str) -> tuple[LocationRecord, ...]:
    mission_seed = lookup_mission_seed(package, mission_id)
    return tuple(lookup_location(package, location_id) for location_id in mission_seed.location_ids)


def mission_citation_trail(package: TownPackage, mission_id: str) -> list[dict[str, object]]:
    """Resolve each mission claim to its source records for teacher review."""
    trail = []
    for claim in claims_for_mission(package, mission_id):
        if claim.claim_type in {ClaimType.VERIFIED_FACT, ClaimType.SOURCE_BASED_INFERENCE} and not claim.source_ids:
            raise MindseyeDataError(f"{claim.claim_id} needs at least one source")

        sources = [lookup_source(package, source_id) for source_id in claim.source_ids]
        trail.append(
            {
                "mission_id": mission_id,
                "claim_id": claim.claim_id,
                "claim_text": claim.claim_text,
                "claim_type": claim.claim_type.value,
                "confidence": claim.confidence.value,
                "source_ids": list(claim.source_ids),
                "sources": [
                    {
                        "source_id": source.source_id,
                        "title": source.title,
                        "citation": source.citation,
                        "rights_status": source.rights_status,
                        "access_level": source.access_level,
                    }
                    for source in sources
                ],
                "reasoning_note": claim.reasoning_note,
            }
        )
    return trail


def mission_map_trail(package: TownPackage, mission_id: str) -> list[dict[str, object]]:
    """Resolve each mission claim to related map locations where present."""
    trail = []
    for claim in claims_for_mission(package, mission_id):
        locations = [lookup_location(package, location_id) for location_id in claim.related_location_ids]
        trail.append(
            {
                "mission_id": mission_id,
                "claim_id": claim.claim_id,
                "claim_type": claim.claim_type.value,
                "confidence": claim.confidence.value,
                "location_ids": list(claim.related_location_ids),
                "locations": [
                    {
                        "location_id": location.location_id,
                        "label": location.label,
                        "map_id": location.map_id,
                        "certainty": location.certainty,
                        "source_ids": list(location.source_ids),
                    }
                    for location in locations
                ],
            }
        )
    return trail


def assert_provenance_integrity(package: TownPackage) -> None:
    """Validate that historical claims keep their evidence boundaries intact."""
    for claim in package.claims:
        if claim.claim_type in {ClaimType.VERIFIED_FACT, ClaimType.SOURCE_BASED_INFERENCE}:
            if not claim.source_ids:
                raise MindseyeDataError(f"{claim.claim_id} needs at least one source")
            for source_id in claim.source_ids:
                if source_id not in package.source_ids:
                    raise MindseyeDataError(f"{claim.claim_id} references missing source: {source_id}")
            if claim.confidence == Confidence.FICTIONAL:
                raise MindseyeDataError(f"{claim.claim_id} cannot use fictional confidence")

        if claim.claim_type == ClaimType.FICTIONAL_GAMEPLAY:
            if claim.confidence != Confidence.FICTIONAL:
                raise MindseyeDataError(f"{claim.claim_id} must use fictional confidence")

        for location_id in claim.related_location_ids:
            if location_id not in package.location_ids:
                raise MindseyeDataError(f"{claim.claim_id} references missing location: {location_id}")


def teacher_claim_summary(claims: tuple[ClaimRecord, ...]) -> list[dict[str, object]]:
    """Return a teacher-facing claim summary without hiding provenance labels."""
    return [
        {
            "claim_id": claim.claim_id,
            "claim_text": claim.claim_text,
            "claim_type": claim.claim_type.value,
            "confidence": claim.confidence.value,
            "source_ids": list(claim.source_ids),
            "reasoning_note": claim.reasoning_note,
        }
        for claim in claims
        if claim.teacher_visible
    ]


def has_unsupported_historical_claims(claims: tuple[ClaimRecord, ...]) -> bool:
    """Return True when a non-fictional claim lacks source support."""
    return any(
        claim.claim_type in {ClaimType.VERIFIED_FACT, ClaimType.SOURCE_BASED_INFERENCE}
        and not claim.source_ids
        for claim in claims
    )
