from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

from ..models import MindseyeDataError, require_text, require_text_tuple

EVIDENCE_PIPELINE = "evidence_assistant"
VISUAL_PIPELINE = "visual_asset"
ALLOWED_PIPELINES = {EVIDENCE_PIPELINE, VISUAL_PIPELINE}

EVIDENCE_PROMPT_ID = "prompt_community_evidence_assistant_v001"
VISUAL_PROMPT_ID = "prompt_community_visual_asset_v001"

EVIDENCE_OUTPUT_STATUS = "candidate_pending_review"
VISUAL_OUTPUT_STATUS = "illustrative"

PENDING_REVIEW = "pending_review"

ALLOWED_RECORD_TYPES = {"building", "location", "person", "business", "source"}
EVIDENCE_REQUEST_KINDS = {
    "candidate_building",
    "candidate_person",
    "candidate_business",
    "candidate_label",
    "candidate_source_link",
    "candidate_location",
}
VISUAL_REQUEST_KINDS = {
    "building_art",
    "road_texture",
    "rail_texture",
    "terrain_texture",
    "person_art",
    "object_art",
    "ui_texture",
}
ALLOWED_INTENDED_LAYERS = {
    "base-map",
    "road-rail",
    "building-footprint",
    "building-art",
    "label-layer",
    "quest-marker-layer",
    "evidence-provenance-layer",
    "interface",
    "people-layer",
    "object-layer",
    "runtime-overlay",
}


@dataclass(frozen=True)
class AIRequestReference:
    record_type: str
    record_id: str

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "AIRequestReference":
        return cls(
            record_type=require_text(raw, "record_type", "AI request reference"),
            record_id=require_text(raw, "record_id", "AI request reference"),
        )


@dataclass(frozen=True)
class AIRequest:
    request_id: str
    pipeline: str
    request_kind: str
    target_record_type: str
    target_record_id: str
    source_ids: tuple[str, ...]
    prompt_id: str
    prompt_version: str
    review_state: str
    output_status: str
    provenance_notes: str
    candidate_label: str = ""
    candidate_summary: str = ""
    asset_name: str = ""
    style: str = ""
    dimensions: dict[str, int] = field(default_factory=dict)
    transparent_background: bool | None = None
    intended_layer: str = ""
    notes: str = ""
    references: tuple[AIRequestReference, ...] = field(default_factory=tuple)

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "AIRequest":
        references_raw = raw.get("references", [])
        if not isinstance(references_raw, list):
            raise MindseyeDataError("AI request missing valid references list")
        references = tuple(AIRequestReference.from_dict(item) for item in references_raw if isinstance(item, dict))
        if len(references) != len(references_raw):
            raise MindseyeDataError("AI request contains invalid reference entry")

        dimensions = raw.get("dimensions", {})
        if dimensions is None:
            dimensions = {}
        if not isinstance(dimensions, dict):
            raise MindseyeDataError("AI request dimensions must be a JSON object")
        parsed_dimensions: dict[str, int] = {}
        for key, value in dimensions.items():
            if key not in {"width", "height"}:
                raise MindseyeDataError("AI request dimensions may only include width and height")
            if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
                raise MindseyeDataError(f"AI request dimensions must be positive integers: {key}")
            parsed_dimensions[key] = value

        transparent_background = raw.get("transparent_background", None)
        if transparent_background is not None and not isinstance(transparent_background, bool):
            raise MindseyeDataError("AI request transparent_background must be boolean when present")

        return cls(
            request_id=require_text(raw, "request_id", "AI request"),
            pipeline=require_text(raw, "pipeline", "AI request"),
            request_kind=require_text(raw, "request_kind", "AI request"),
            target_record_type=require_text(raw, "target_record_type", "AI request"),
            target_record_id=require_text(raw, "target_record_id", "AI request"),
            source_ids=require_text_tuple(raw, "source_ids", "AI request", allow_empty=True),
            prompt_id=require_text(raw, "prompt_id", "AI request"),
            prompt_version=require_text(raw, "prompt_version", "AI request"),
            review_state=require_text(raw, "review_state", "AI request"),
            output_status=require_text(raw, "output_status", "AI request"),
            provenance_notes=require_text(raw, "provenance_notes", "AI request"),
            candidate_label=str(raw.get("candidate_label", "")),
            candidate_summary=str(raw.get("candidate_summary", "")),
            asset_name=str(raw.get("asset_name", "")),
            style=str(raw.get("style", "")),
            dimensions=parsed_dimensions,
            transparent_background=transparent_background,
            intended_layer=str(raw.get("intended_layer", "")),
            notes=str(raw.get("notes", "")),
            references=references,
        )


@dataclass(frozen=True)
class AssetGenerationQueue:
    queue_id: str
    town_package_id: str
    town_name: str
    map_year: int
    queue_status: str
    execution_mode: str
    live_api_enabled: bool
    request_count: int
    pipeline_counts: dict[str, int]
    requests: tuple[AIRequest, ...]
    notes: str = ""
    version: int = 1

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "AssetGenerationQueue":
        requests_raw = raw.get("requests", [])
        if not isinstance(requests_raw, list) or not requests_raw:
            raise MindseyeDataError("asset generation queue must include requests")
        if any(not isinstance(item, dict) for item in requests_raw):
            raise MindseyeDataError("asset generation queue contains an invalid request entry")

        pipeline_counts = raw.get("pipeline_counts", {})
        if not isinstance(pipeline_counts, dict) or not pipeline_counts:
            raise MindseyeDataError("asset generation queue missing pipeline_counts")
        normalized_counts: dict[str, int] = {}
        for key, value in pipeline_counts.items():
            if not isinstance(key, str) or not key.strip():
                raise MindseyeDataError("asset generation queue pipeline_counts contains invalid key")
            if not isinstance(value, int) or isinstance(value, bool) or value < 0:
                raise MindseyeDataError(f"asset generation queue pipeline count must be a non-negative integer: {key}")
            normalized_counts[key] = value

        return cls(
            queue_id=require_text(raw, "queue_id", "asset generation queue"),
            town_package_id=require_text(raw, "town_package_id", "asset generation queue"),
            town_name=require_text(raw, "town_name", "asset generation queue"),
            map_year=_require_positive_int(raw, "map_year", "asset generation queue"),
            queue_status=require_text(raw, "queue_status", "asset generation queue"),
            execution_mode=require_text(raw, "execution_mode", "asset generation queue"),
            live_api_enabled=_require_bool(raw, "live_api_enabled", "asset generation queue"),
            request_count=_require_positive_int(raw, "request_count", "asset generation queue"),
            pipeline_counts=normalized_counts,
            requests=tuple(AIRequest.from_dict(item) for item in requests_raw),
            notes=str(raw.get("notes", "")),
            version=_require_positive_int(raw, "version", "asset generation queue", default=1),
        )


def validate_ai_request(request: AIRequest) -> None:
    if request.pipeline not in ALLOWED_PIPELINES:
        raise MindseyeDataError(f"AI request {request.request_id} has unsupported pipeline: {request.pipeline}")
    if request.target_record_type not in ALLOWED_RECORD_TYPES:
        raise MindseyeDataError(
            f"AI request {request.request_id} has unsupported target_record_type: {request.target_record_type}"
        )
    if not request.target_record_id.strip():
        raise MindseyeDataError(f"AI request {request.request_id} is missing target_record_id")
    if not request.source_ids:
        raise MindseyeDataError(f"AI request {request.request_id} needs at least one source")
    if request.review_state != PENDING_REVIEW:
        raise MindseyeDataError(f"AI request {request.request_id} must stay pending_review")

    for source_id in request.source_ids:
        if not source_id.strip():
            raise MindseyeDataError(f"AI request {request.request_id} has an empty source id")

    if request.pipeline == EVIDENCE_PIPELINE:
        _validate_evidence_request(request)
    elif request.pipeline == VISUAL_PIPELINE:
        _validate_visual_request(request)


def validate_asset_generation_queue(queue: AssetGenerationQueue) -> None:
    if queue.execution_mode != "stub_only":
        raise MindseyeDataError("asset generation queue must remain stub_only")
    if queue.live_api_enabled:
        raise MindseyeDataError("asset generation queue must not enable live_api")
    if queue.request_count != len(queue.requests):
        raise MindseyeDataError("asset generation queue request_count does not match requests")
    if queue.version != 1:
        raise MindseyeDataError("asset generation queue version must be 1")

    if queue.queue_status not in {"draft", "queued", "ready_for_review"}:
        raise MindseyeDataError(f"asset generation queue has unsupported queue_status: {queue.queue_status}")
    if queue.map_year <= 0:
        raise MindseyeDataError("asset generation queue must include a positive map_year")
    if set(queue.pipeline_counts) != ALLOWED_PIPELINES:
        raise MindseyeDataError("asset generation queue pipeline_counts must list the two supported pipelines")

    seen_request_ids: set[str] = set()
    actual_counts = {pipeline: 0 for pipeline in ALLOWED_PIPELINES}
    for request in queue.requests:
        if request.request_id in seen_request_ids:
            raise MindseyeDataError(f"duplicate AI request id: {request.request_id}")
        seen_request_ids.add(request.request_id)
        validate_ai_request(request)
        actual_counts[request.pipeline] = actual_counts.get(request.pipeline, 0) + 1

    for pipeline in ALLOWED_PIPELINES:
        expected = queue.pipeline_counts.get(pipeline, 0)
        actual = actual_counts.get(pipeline, 0)
        if expected != actual:
            raise MindseyeDataError(
                f"asset generation queue pipeline_counts mismatch for {pipeline}: expected {expected}, actual {actual}"
            )


def validate_known_record_reference(request: AIRequest, known_record_ids_by_type: dict[str, set[str]]) -> None:
    known_ids = known_record_ids_by_type.get(request.target_record_type, set())
    if request.target_record_id not in known_ids:
        raise MindseyeDataError(
            f"AI request {request.request_id} references missing {request.target_record_type}: {request.target_record_id}"
        )
    for source_id in request.source_ids:
        if source_id not in known_record_ids_by_type.get("source", set()):
            raise MindseyeDataError(f"AI request {request.request_id} references missing source: {source_id}")


def queue_to_dict(queue: AssetGenerationQueue) -> dict[str, Any]:
    payload = asdict(queue)
    payload["requests"] = [asdict(request) for request in queue.requests]
    return payload


def _validate_evidence_request(request: AIRequest) -> None:
    if request.output_status != EVIDENCE_OUTPUT_STATUS:
        raise MindseyeDataError(
            f"AI request {request.request_id} must use output_status={EVIDENCE_OUTPUT_STATUS}"
        )
    if request.prompt_id != EVIDENCE_PROMPT_ID:
        raise MindseyeDataError(f"AI request {request.request_id} must use prompt_id={EVIDENCE_PROMPT_ID}")
    if request.request_kind not in EVIDENCE_REQUEST_KINDS:
        raise MindseyeDataError(f"AI request {request.request_id} has unsupported request_kind: {request.request_kind}")
    if request.request_kind == "candidate_person" and request.target_record_type != "person":
        raise MindseyeDataError(
            f"AI request {request.request_id} must target person records for candidate_person requests"
        )
    if request.request_kind == "candidate_business" and request.target_record_type != "business":
        raise MindseyeDataError(
            f"AI request {request.request_id} must target business records for candidate_business requests"
        )
    if request.request_kind == "candidate_source_link" and request.target_record_type != "source":
        raise MindseyeDataError(
            f"AI request {request.request_id} must target source records for candidate_source_link requests"
        )
    if request.request_kind == "candidate_location" and request.target_record_type != "location":
        raise MindseyeDataError(
            f"AI request {request.request_id} must target location records for candidate_location requests"
        )
    if request.request_kind == "candidate_building" and request.target_record_type not in {"building", "location"}:
        raise MindseyeDataError(
            f"AI request {request.request_id} must target building or location records for candidate_building requests"
        )
    if not request.candidate_label.strip():
        raise MindseyeDataError(f"AI request {request.request_id} must include candidate_label")
    if not request.candidate_summary.strip():
        raise MindseyeDataError(f"AI request {request.request_id} must include candidate_summary")
    if request.style.strip():
        raise MindseyeDataError(f"AI request {request.request_id} evidence output must not include style")
    if request.dimensions:
        raise MindseyeDataError(f"AI request {request.request_id} evidence output must not include dimensions")
    if request.transparent_background is not None:
        raise MindseyeDataError(
            f"AI request {request.request_id} evidence output must not include transparent_background"
        )
    if request.intended_layer.strip():
        raise MindseyeDataError(f"AI request {request.request_id} evidence output must not include intended_layer")


def _validate_visual_request(request: AIRequest) -> None:
    if request.output_status != VISUAL_OUTPUT_STATUS:
        raise MindseyeDataError(
            f"AI request {request.request_id} must use output_status={VISUAL_OUTPUT_STATUS}"
        )
    if request.prompt_id != VISUAL_PROMPT_ID:
        raise MindseyeDataError(f"AI request {request.request_id} must use prompt_id={VISUAL_PROMPT_ID}")
    if request.request_kind not in VISUAL_REQUEST_KINDS:
        raise MindseyeDataError(f"AI request {request.request_id} has unsupported request_kind: {request.request_kind}")
    if request.request_kind == "building_art" and request.target_record_type != "building":
        raise MindseyeDataError(f"AI request {request.request_id} must target building records for building_art")
    if request.request_kind in {"road_texture", "rail_texture", "terrain_texture", "ui_texture"} and request.target_record_type != "source":
        raise MindseyeDataError(f"AI request {request.request_id} must target source records for texture requests")
    if request.request_kind == "person_art" and request.target_record_type not in {"person", "source"}:
        raise MindseyeDataError(f"AI request {request.request_id} must target person or source records for person_art")
    if request.request_kind == "object_art" and request.target_record_type not in {"building", "location", "source"}:
        raise MindseyeDataError(
            f"AI request {request.request_id} must target building, location, or source records for object_art"
        )
    if not request.asset_name.strip():
        raise MindseyeDataError(f"AI request {request.request_id} must include asset_name")
    if not request.style.strip():
        raise MindseyeDataError(f"AI request {request.request_id} must include style")
    if not request.dimensions:
        raise MindseyeDataError(f"AI request {request.request_id} must include dimensions")
    if "width" not in request.dimensions or "height" not in request.dimensions:
        raise MindseyeDataError(f"AI request {request.request_id} dimensions must include width and height")
    if request.transparent_background is None:
        raise MindseyeDataError(
            f"AI request {request.request_id} must include transparent_background"
        )
    if request.intended_layer not in ALLOWED_INTENDED_LAYERS:
        raise MindseyeDataError(
            f"AI request {request.request_id} has unsupported intended_layer: {request.intended_layer}"
        )


def _require_bool(raw: dict[str, Any], key: str, label: str) -> bool:
    value = raw.get(key)
    if not isinstance(value, bool):
        raise MindseyeDataError(f"{label} missing required boolean field: {key}")
    return value


def _require_positive_int(raw: dict[str, Any], key: str, label: str, default: int | None = None) -> int:
    if key not in raw:
        if default is not None:
            return default
        raise MindseyeDataError(f"{label} missing required positive integer field: {key}")
    value = raw.get(key)
    if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
        raise MindseyeDataError(f"{label} missing required positive integer field: {key}")
    return value
