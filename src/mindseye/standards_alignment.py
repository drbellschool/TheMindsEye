from __future__ import annotations

from pathlib import Path

from .instructional_alignment import load_instructional_alignment_manifest
from .models import MindseyeDataError, TownPackage
from .teacher_review import build_teacher_approval_packet


def build_standards_alignment_packet(
    package: TownPackage,
    repo_root: Path | None = None,
    town_slug: str = "texarkana",
) -> dict[str, object]:
    """Build a read-only standards and TEKS review packet.

    This is a foundation contract for the teacher portal. It does not invent
    exact TEKS codes, score alignment quality, or approve classroom use.
    """
    alignment_manifest = load_instructional_alignment_manifest(repo_root, town_slug)
    approval_packet = build_teacher_approval_packet(package, repo_root=repo_root, town_slug=town_slug)

    teks_records = [
        _alignment_record(alignment)
        for alignment in alignment_manifest.alignments
        if alignment.framework == "TEKS"
    ]
    hqim_records = [
        _alignment_record(alignment)
        for alignment in alignment_manifest.alignments
        if alignment.framework == "HQIM"
    ]

    current_teks_record = next((record for record in teks_records if record["alignment_status"] != "reviewed"), None)
    exact_standard_under_review = current_teks_record or (teks_records[0] if teks_records else None)
    if exact_standard_under_review is None:
        raise MindseyeDataError("instructional alignment manifest must include a TEKS record")

    decision_state = approval_packet["review_status"]
    if alignment_manifest.teks_status == "pending_teacher_selection":
        decision_state = "pending_teacher_selection"

    return {
        "workflow_title": "Standards & TEKS Review",
        "mission_id": alignment_manifest.mission_id,
        "town_package_id": alignment_manifest.town_package_id,
        "hqim_status": alignment_manifest.hqim_status,
        "teks_status": alignment_manifest.teks_status,
        "teacher_scope_policy": {
            "primary_subject_only": True,
            "secondary_teks_allowed": True,
            "secondary_tether_visibility": "mission_secondary_only",
            "portal_visibility": "logged_in_teacher_subject_only",
        },
        "teacher_authority_rule": alignment_manifest.teacher_authority_rule,
        "current_standard_under_review": exact_standard_under_review,
        "decision_state": decision_state,
        "decision_options": [
            "approve",
            "send_back_to_tighten_alignment",
            "defer",
        ],
        "release_gate": {
            "status": "blocked" if alignment_manifest.teks_status != "approved_for_mission_use" else "ready",
            "reason": "Exact TEKS selection remains pending."
            if alignment_manifest.teks_status != "approved_for_mission_use"
            else "Exact TEKS selection is approved for mission use.",
        },
        "hqim_records": hqim_records,
        "teks_records": teks_records,
        "review_notes": list(approval_packet["review_items"]),
        "secondary_alignment_tethers": [],
    }


def _alignment_record(alignment) -> dict[str, object]:
    return {
        "alignment_id": alignment.alignment_id,
        "framework": alignment.framework,
        "subject_area": alignment.subject_area,
        "grade_band": alignment.grade_band,
        "alignment_status": alignment.alignment_status,
        "standard_id": alignment.standard_id,
        "standard_label": alignment.standard_label,
        "hqim_dimension": alignment.hqim_dimension,
        "evidence_expectations": list(alignment.evidence_expectations),
        "teacher_review_required": alignment.teacher_review_required,
        "notes": alignment.notes,
    }
