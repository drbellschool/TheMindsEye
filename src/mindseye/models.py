from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class MindseyeDataError(ValueError):
    """Raised when a town package violates a documented contract."""


class ClaimType(str, Enum):
    VERIFIED_FACT = "verified_fact"
    SOURCE_BASED_INFERENCE = "source_based_inference"
    FICTIONAL_GAMEPLAY = "fictional_gameplay"


class Confidence(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    PLACEHOLDER = "placeholder"
    FICTIONAL = "fictional"


@dataclass(frozen=True)
class SourceRecord:
    source_id: str
    title: str
    source_type: str
    citation: str
    rights_status: str
    access_level: str
    repository: str = ""
    url: str = ""
    accessed_date: str = ""
    notes: str = ""

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "SourceRecord":
        return cls(
            source_id=require_text(raw, "source_id", "source"),
            title=require_text(raw, "title", "source"),
            source_type=require_text(raw, "source_type", "source"),
            citation=require_text(raw, "citation", "source"),
            rights_status=require_text(raw, "rights_status", "source"),
            access_level=require_text(raw, "access_level", "source"),
            repository=str(raw.get("repository", "")),
            url=str(raw.get("url", "")),
            accessed_date=str(raw.get("accessed_date", "")),
            notes=str(raw.get("notes", "")),
        )


@dataclass(frozen=True)
class LocationRecord:
    location_id: str
    map_id: str
    label: str
    source_ids: tuple[str, ...]
    street: str = ""
    location_type: str = ""
    certainty: str = ""
    notes: str = ""

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "LocationRecord":
        return cls(
            location_id=require_text(raw, "location_id", "location"),
            map_id=require_text(raw, "map_id", "location"),
            label=require_text(raw, "label", "location"),
            source_ids=require_text_tuple(raw, "source_ids", "location"),
            street=str(raw.get("street", "")),
            location_type=str(raw.get("location_type", "")),
            certainty=str(raw.get("certainty", "")),
            notes=str(raw.get("notes", "")),
        )


@dataclass(frozen=True)
class ClaimRecord:
    claim_id: str
    claim_text: str
    claim_type: ClaimType
    confidence: Confidence
    source_ids: tuple[str, ...]
    reasoning_note: str
    related_location_ids: tuple[str, ...] = field(default_factory=tuple)
    related_entity_ids: tuple[str, ...] = field(default_factory=tuple)
    student_visible: bool = True
    teacher_visible: bool = True

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "ClaimRecord":
        claim_type = ClaimType(require_text(raw, "claim_type", "claim"))
        confidence = Confidence(require_text(raw, "confidence", "claim"))
        return cls(
            claim_id=require_text(raw, "claim_id", "claim"),
            claim_text=require_text(raw, "claim_text", "claim"),
            claim_type=claim_type,
            confidence=confidence,
            source_ids=require_text_tuple(raw, "source_ids", "claim", allow_empty=True),
            related_location_ids=require_text_tuple(raw, "related_location_ids", "claim", allow_empty=True),
            related_entity_ids=require_text_tuple(raw, "related_entity_ids", "claim", allow_empty=True),
            reasoning_note=require_text(raw, "reasoning_note", "claim"),
            student_visible=bool(raw.get("student_visible", True)),
            teacher_visible=bool(raw.get("teacher_visible", True)),
        )


@dataclass(frozen=True)
class MissionSeed:
    mission_id: str
    town_package_id: str
    title: str
    teacher_goal: str
    location_ids: tuple[str, ...]
    claim_ids: tuple[str, ...]
    fictional_elements: tuple[str, ...]
    student_hook: str
    teacher_notes: str

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "MissionSeed":
        return cls(
            mission_id=require_text(raw, "mission_id", "mission"),
            town_package_id=require_text(raw, "town_package_id", "mission"),
            title=require_text(raw, "title", "mission"),
            teacher_goal=require_text(raw, "teacher_goal", "mission"),
            location_ids=require_text_tuple(raw, "location_ids", "mission"),
            claim_ids=require_text_tuple(raw, "claim_ids", "mission"),
            fictional_elements=require_text_tuple(raw, "fictional_elements", "mission", allow_empty=True),
            student_hook=require_text(raw, "student_hook", "mission"),
            teacher_notes=require_text(raw, "teacher_notes", "mission"),
        )


@dataclass(frozen=True)
class TownPackage:
    package_id: str
    town_name: str
    state_region: str
    time_window: dict[str, Any]
    status: str
    map_layers: tuple[dict[str, Any], ...]
    sources: tuple[SourceRecord, ...]
    locations: tuple[LocationRecord, ...]
    claims: tuple[ClaimRecord, ...]
    mission_seed: MissionSeed
    notes: str = ""
    raw_source_records: tuple[dict[str, Any], ...] = field(default_factory=tuple)

    @property
    def source_ids(self) -> set[str]:
        return {source.source_id for source in self.sources}

    @property
    def location_ids(self) -> set[str]:
        return {location.location_id for location in self.locations}

    @property
    def claim_ids(self) -> set[str]:
        return {claim.claim_id for claim in self.claims}

    @property
    def mission_seeds(self) -> tuple[MissionSeed, ...]:
        return (self.mission_seed,)


def require_text(raw: dict[str, Any], key: str, label: str) -> str:
    value = raw.get(key)
    if not isinstance(value, str) or not value.strip():
        raise MindseyeDataError(f"{label} missing required text field: {key}")
    return value


def require_text_tuple(raw: dict[str, Any], key: str, label: str, allow_empty: bool = False) -> tuple[str, ...]:
    value = raw.get(key)
    if not isinstance(value, list):
        raise MindseyeDataError(f"{label} missing required list field: {key}")
    if not allow_empty and not value:
        raise MindseyeDataError(f"{label} list cannot be empty: {key}")
    bad_values = [item for item in value if not isinstance(item, str) or not item.strip()]
    if bad_values:
        raise MindseyeDataError(f"{label} list contains invalid IDs in: {key}")
    return tuple(value)
