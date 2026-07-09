from __future__ import annotations

import json
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from .models import MindseyeDataError

REVIEW_EVENT_LOG_FILENAME = "review_events.jsonl"

_COMMUNITY_OVERRIDE_FIELDS = {"review_status", "historical_basis", "notes", "related_location_ids"}
_BUILDING_OVERRIDE_FIELDS = {"identity_status", "identity_basis", "visual_detail_status", "notes"}
ALLOWED_COMMUNITY_REVIEW_STATUSES = {
    "suggested",
    "under_review",
    "confirmed",
    "rejected",
    "insufficient_evidence",
}
ALLOWED_COMMUNITY_HISTORICAL_BASIS = {
    "verified_fact",
    "source_based_inference",
    "fictional_gameplay",
}
ALLOWED_BUILDING_IDENTITY_STATUSES = {"suggested", "reviewed", "approved"}
ALLOWED_BUILDING_IDENTITY_BASIS = {"verified_fact", "source_based_inference"}
ALLOWED_BUILDING_VISUAL_DETAIL_STATUSES = {"verified", "inferred", "illustrative"}
ALLOWED_RECORD_GROUPS = {"people", "businesses"}


def load_review_state(state_dir: Path | None) -> dict[str, Any]:
    """Load the persisted review overlay by replaying the event log.

    The review state is intentionally append-only JSONL so the local prototype
    can stay auditable without introducing a database dependency yet.
    """
    state = _empty_review_state()
    if state_dir is None:
        return state

    event_log_path = _event_log_path(state_dir)
    if not event_log_path.exists():
        return state

    events: list[dict[str, Any]] = []
    for line_number, raw_line in enumerate(event_log_path.read_text(encoding="utf-8").splitlines(), start=1):
        if not raw_line.strip():
            continue
        try:
            event = json.loads(raw_line)
        except json.JSONDecodeError as exc:
            raise MindseyeDataError(f"invalid review event JSON on line {line_number}: {exc}") from exc
        if not isinstance(event, dict):
            raise MindseyeDataError(f"review event on line {line_number} must be a JSON object")
        _validate_review_event(event)
        _apply_review_event(state, event)
        events.append(event)

    state["events"] = events
    return state


def append_review_event(state_dir: Path, event: dict[str, Any]) -> dict[str, Any]:
    """Append a new review event to the JSONL log and return the stored event."""
    if not isinstance(event, dict):
        raise MindseyeDataError("review event must be a JSON object")

    enriched_event = dict(event)
    _validate_review_event(enriched_event)
    enriched_event.setdefault("event_id", f"review_event_{uuid4().hex}")
    enriched_event.setdefault("created_at", _utc_now())
    enriched_event.setdefault("schema_version", 1)

    state_dir.mkdir(parents=True, exist_ok=True)
    event_log_path = _event_log_path(state_dir)
    with event_log_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(enriched_event, sort_keys=True))
        handle.write("\n")

    return enriched_event


def build_community_review_event(
    *,
    town_slug: str,
    record_group: str,
    record_id: str,
    review_status: str,
    historical_basis: str,
    notes: str = "",
    return_to: str = "",
) -> dict[str, Any]:
    record_group = _require_choice(record_group, ALLOWED_RECORD_GROUPS, "record_group")
    record_id = _require_text(record_id, "record_id")
    review_status = _require_choice(review_status, ALLOWED_COMMUNITY_REVIEW_STATUSES, "review_status")
    historical_basis = _require_choice(historical_basis, ALLOWED_COMMUNITY_HISTORICAL_BASIS, "historical_basis")
    notes = _clean_text(notes)
    return {
        "domain": "community_review",
        "town_slug": _clean_text(town_slug),
        "record_group": record_group,
        "record_id": record_id,
        "overrides": {
            "review_status": review_status,
            "historical_basis": historical_basis,
            "notes": notes,
        },
        "summary": f"{_pretty_record_group(record_group)} {record_id}: {review_status} / {historical_basis}",
        "notes": notes,
        "return_to": _clean_text(return_to),
    }


def build_building_review_event(
    *,
    town_slug: str,
    record_id: str,
    identity_status: str,
    identity_basis: str,
    visual_detail_status: str,
    notes: str = "",
    return_to: str = "",
) -> dict[str, Any]:
    record_id = _require_text(record_id, "record_id")
    identity_status = _require_choice(identity_status, ALLOWED_BUILDING_IDENTITY_STATUSES, "identity_status")
    identity_basis = _require_choice(identity_basis, ALLOWED_BUILDING_IDENTITY_BASIS, "identity_basis")
    visual_detail_status = _require_choice(
        visual_detail_status,
        ALLOWED_BUILDING_VISUAL_DETAIL_STATUSES,
        "visual_detail_status",
    )
    notes = _clean_text(notes)
    return {
        "domain": "building",
        "town_slug": _clean_text(town_slug),
        "record_id": record_id,
        "overrides": {
            "identity_status": identity_status,
            "identity_basis": identity_basis,
            "visual_detail_status": visual_detail_status,
            "notes": notes,
        },
        "summary": f"Building {record_id}: {identity_status} / {visual_detail_status}",
        "notes": notes,
        "return_to": _clean_text(return_to),
    }


def apply_community_review_state(packet: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
    """Overlay persisted community-review edits onto a normalized packet."""
    if not state:
        return packet

    updated_packet = deepcopy(packet)
    review_state = state.get("community_review")
    if not isinstance(review_state, dict):
        return updated_packet

    for record_key in ("people", "businesses"):
        records = updated_packet.get(record_key)
        overrides = review_state.get(record_key, {})
        if not isinstance(records, list) or not isinstance(overrides, dict):
            continue

        for record in records:
            if not isinstance(record, dict):
                continue
            record_id = str(record.get("review_record_id", ""))
            override = overrides.get(record_id)
            if not isinstance(override, dict):
                continue
            for field_name in _COMMUNITY_OVERRIDE_FIELDS:
                if field_name in override:
                    record[field_name] = override[field_name]

    return updated_packet


def apply_building_manifest_state(manifest: Any, state: dict[str, Any]) -> Any:
    """Overlay persisted building edits onto a frozen building manifest."""
    if not state:
        return manifest

    building_overrides = state.get("buildings")
    if not isinstance(building_overrides, dict) or not building_overrides:
        return manifest

    from dataclasses import replace

    updated_buildings = []
    for building in manifest.buildings:
        override = building_overrides.get(building.building_id)
        if not isinstance(override, dict):
            updated_buildings.append(building)
            continue

        allowed_override = {
            field_name: override[field_name]
            for field_name in _BUILDING_OVERRIDE_FIELDS
            if field_name in override
        }
        updated_buildings.append(replace(building, **allowed_override))

    return replace(manifest, buildings=tuple(updated_buildings))


def history_items_from_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Turn review events into the dashboard's history-card format."""
    history_items: list[dict[str, Any]] = []
    for event in reversed(events[-8:]):
        if not isinstance(event, dict):
            continue
        domain = str(event.get("domain", "review"))
        record_id = str(event.get("record_id", "unknown"))
        action = str(event.get("action", "updated"))
        summary = str(event.get("summary", "")).strip()
        notes = str(event.get("notes", "")).strip()
        label = summary or f"{_pretty_domain(domain)} update: {record_id}"
        history_items.append(
            {
                "event_id": str(event.get("event_id", "")),
                "label": label,
                "status": action,
                "notes": notes or f"Stored in the local JSON review log for {record_id}.",
            }
        )
    return history_items


def _empty_review_state() -> dict[str, Any]:
    return {
        "community_review": {"people": {}, "businesses": {}},
        "buildings": {},
        "events": [],
    }


def _apply_review_event(state: dict[str, Any], event: dict[str, Any]) -> None:
    domain = str(event.get("domain", ""))
    record_id = str(event.get("record_id", "")).strip()
    if not record_id:
        raise MindseyeDataError("review event is missing record_id")

    overrides = event.get("overrides")
    if not isinstance(overrides, dict):
        raise MindseyeDataError("review event is missing overrides")

    if domain == "community_review":
        record_group = str(event.get("record_group", "")).strip()
        if record_group not in {"people", "businesses"}:
            raise MindseyeDataError("community review event is missing a valid record_group")
        state["community_review"].setdefault(record_group, {})[record_id] = {
            field_name: overrides[field_name]
            for field_name in _COMMUNITY_OVERRIDE_FIELDS
            if field_name in overrides
        }
        return

    if domain == "building":
        state["buildings"][record_id] = {
            field_name: overrides[field_name]
            for field_name in _BUILDING_OVERRIDE_FIELDS
            if field_name in overrides
        }
        return

    raise MindseyeDataError(f"unsupported review event domain: {domain}")


def _validate_review_event(event: dict[str, Any]) -> None:
    domain = _clean_text(event.get("domain", ""))
    record_id = _clean_text(event.get("record_id", ""))
    overrides = event.get("overrides")
    if not record_id:
        raise MindseyeDataError("review event is missing record_id")
    if not isinstance(overrides, dict):
        raise MindseyeDataError("review event is missing overrides")

    if domain == "community_review":
        record_group = _clean_text(event.get("record_group", ""))
        _require_choice(record_group, ALLOWED_RECORD_GROUPS, "record_group")
        _validate_override_values(
            overrides,
            {
                "review_status": ALLOWED_COMMUNITY_REVIEW_STATUSES,
                "historical_basis": ALLOWED_COMMUNITY_HISTORICAL_BASIS,
            },
        )
        return

    if domain == "building":
        _validate_override_values(
            overrides,
            {
                "identity_status": ALLOWED_BUILDING_IDENTITY_STATUSES,
                "identity_basis": ALLOWED_BUILDING_IDENTITY_BASIS,
                "visual_detail_status": ALLOWED_BUILDING_VISUAL_DETAIL_STATUSES,
            },
        )
        return

    raise MindseyeDataError(f"unsupported review event domain: {domain}")


def _validate_override_values(overrides: dict[str, Any], allowed_values: dict[str, set[str]]) -> None:
    for field_name, allowed in allowed_values.items():
        if field_name not in overrides:
            continue
        value = _clean_text(overrides[field_name])
        if value not in allowed:
            raise MindseyeDataError(f"review event has unsupported {field_name}: {value}")


def _require_choice(value: object, allowed_values: set[str], field_name: str) -> str:
    text = _clean_text(value)
    if text not in allowed_values:
        raise MindseyeDataError(f"review event has unsupported {field_name}: {text}")
    return text


def _require_text(value: object, field_name: str) -> str:
    text = _clean_text(value)
    if not text:
        raise MindseyeDataError(f"review event is missing {field_name}")
    return text


def _clean_text(value: object) -> str:
    return str(value).strip()


def _pretty_record_group(record_group: str) -> str:
    return "Business" if record_group == "businesses" else "People"


def _event_log_path(state_dir: Path) -> Path:
    return state_dir / REVIEW_EVENT_LOG_FILENAME


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _pretty_domain(domain: str) -> str:
    return domain.replace("_", " ").strip().title() if domain else "Review"
