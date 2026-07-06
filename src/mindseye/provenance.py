from __future__ import annotations

from collections import defaultdict
from typing import TYPE_CHECKING

from .models import ClaimRecord, ClaimType, Confidence, MindseyeDataError

if TYPE_CHECKING:
    from .models import TownPackage


def claims_by_type(claims: tuple[ClaimRecord, ...]) -> dict[ClaimType, list[ClaimRecord]]:
    grouped: dict[ClaimType, list[ClaimRecord]] = defaultdict(list)
    for claim in claims:
        grouped[claim.claim_type].append(claim)
    return dict(grouped)


def assert_provenance_integrity(package: "TownPackage") -> None:
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
