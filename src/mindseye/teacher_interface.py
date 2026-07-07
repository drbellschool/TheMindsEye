from __future__ import annotations

from pathlib import Path

from .instructional_alignment import load_instructional_alignment_manifest
from .models import MindseyeDataError, TownPackage
from .readiness import build_classroom_readiness_report
from .teacher_review import build_teacher_approval_packet


def build_teacher_interface_packet(
    package: TownPackage,
    repo_root: Path | None = None,
    town_slug: str = "texarkana",
) -> dict[str, object]:
    """Build a read-only teacher portal packet from existing review data.

    This is a foundation contract for a future teacher dashboard. It does not
    approve missions, calculate hidden scores, or invent TEKS codes. It only
    arranges the existing review state into dashboard-ready sections.
    """
    readiness_report = build_classroom_readiness_report(package)
    approval_packet = build_teacher_approval_packet(package, repo_root=repo_root, town_slug=town_slug)
    alignment_manifest = load_instructional_alignment_manifest(repo_root, town_slug)

    return {
        "portal_title": "Teacher Review & Classroom Approval",
        "mission_id": approval_packet["mission_id"],
        "town_package_id": approval_packet["town_package_id"],
        "portal_modules": _portal_modules(),
        "workflow_steps": _workflow_steps(approval_packet),
        "summary_cards": _summary_cards(readiness_report, approval_packet),
        "review_workspace": _review_workspace(alignment_manifest, approval_packet),
        "decision_panel": _decision_panel(approval_packet),
        "review_history": [],
        "release_state": _release_state(approval_packet, readiness_report),
    }


def _workflow_steps(approval_packet: dict[str, object]) -> list[dict[str, object]]:
    blocked = not bool(approval_packet["classroom_release_ready"])
    return [
        {
            "step_number": 1,
            "title": "Mission Overview",
            "status": "completed",
            "note": "Mission metadata and teacher summary are loaded from the town package.",
        },
        {
            "step_number": 2,
            "title": "Standards & TEKS Review",
            "status": "in_progress",
            "note": "Teacher selection remains required for the exact TEKS target.",
        },
        {
            "step_number": 3,
            "title": "HQIM Alignment",
            "status": "upcoming",
            "note": "Instructional alignment must remain teacher-reviewed and visible.",
        },
        {
            "step_number": 4,
            "title": "Historical Verification",
            "status": "upcoming",
            "note": "Source sufficiency and claim provenance remain separate from gameplay.",
        },
        {
            "step_number": 5,
            "title": "Accommodations",
            "status": "upcoming",
            "note": "Accessibility and language supports belong in the teacher workflow.",
        },
        {
            "step_number": 6,
            "title": "Teacher Certification",
            "status": "upcoming",
            "note": "Teacher approval is the final human gate before release.",
        },
        {
            "step_number": 7,
            "title": "Classroom Release",
            "status": "locked" if blocked else "unlocked",
            "note": "Release remains blocked until teacher approval is recorded.",
        },
    ]


def _portal_modules() -> list[dict[str, object]]:
    return [
        {"module_id": "dashboard", "label": "Dashboard", "status": "available"},
        {"module_id": "mission_queue", "label": "Mission Queue", "status": "planned"},
        {"module_id": "teks_library", "label": "TEKS Library", "status": "planned"},
        {"module_id": "class_summary", "label": "Class Summary", "status": "planned"},
        {"module_id": "student_progress", "label": "Student Progress", "status": "planned"},
        {"module_id": "grades", "label": "Grades", "status": "planned"},
        {"module_id": "roster_members", "label": "Roster / Members", "status": "planned"},
        {"module_id": "chat_conversations", "label": "Chat Conversations", "status": "planned"},
        {"module_id": "telegram_review", "label": "Telegram Review", "status": "planned"},
        {"module_id": "postal_review", "label": "Postal Review", "status": "planned"},
        {"module_id": "behavior_law_flags", "label": "Behavior / Law Flags", "status": "planned"},
        {"module_id": "review_history", "label": "Review History", "status": "planned"},
        {"module_id": "reports", "label": "Reports", "status": "planned"},
        {"module_id": "help_support", "label": "Need Help?", "status": "planned"},
    ]


def _summary_cards(
    readiness_report: dict[str, object],
    approval_packet: dict[str, object],
) -> list[dict[str, object]]:
    blocker_count = len(readiness_report["blockers"])
    review_status = str(approval_packet["review_status"])
    release_ready = bool(approval_packet["classroom_release_ready"])

    return [
        {
            "card_id": "readiness",
            "label": "Readiness",
            "value": None,
            "status": "blocked" if blocker_count else "ready",
            "note": "Readiness is derived from explicit blockers, not a hidden score.",
        },
        {
            "card_id": "quality_score",
            "label": "Quality Score",
            "value": None,
            "status": "not_calculated",
            "note": "A rubric-backed quality score is not implemented yet.",
        },
        {
            "card_id": "release_status",
            "label": "Release Status",
            "value": "Blocked" if not release_ready else "Approved",
            "status": "blocked" if not release_ready else "approved",
            "note": f"Teacher review is currently {review_status}.",
        },
    ]


def _review_workspace(
    alignment_manifest,
    approval_packet: dict[str, object],
) -> dict[str, object]:
    return {
        "exact_standard_under_review": {
            "status": "pending_teacher_selection",
            "alignment_id": "alignment_texarkana_1885_teks_001",
            "standard_label": _alignment_label(alignment_manifest, "alignment_texarkana_1885_teks_001"),
            "teacher_authority_rule": approval_packet["teacher_authority_rule"],
        },
        "mission_content_being_reviewed": {
            "mission_id": approval_packet["mission_id"],
            "title": approval_packet["title"],
            "review_items": list(approval_packet["review_items"]),
        },
        "teacher_alignment_decision": {
            "allowed_actions": ["approve", "send_back", "defer"],
            "current_state": approval_packet["review_status"],
            "pending_alignment_ids": list(approval_packet["pending_alignment_ids"]),
            "approved_alignment_ids": list(approval_packet["approved_alignment_ids"]),
            "rejected_alignment_ids": list(approval_packet["rejected_alignment_ids"]),
        },
    }


def _decision_panel(approval_packet: dict[str, object]) -> dict[str, object]:
    return {
        "teacher_identity": {
            "reviewer_name": "Teacher",
            "credential_status": "verified",
        },
        "decision_actions": [
            {
                "action_id": "approve_teks_alignment",
                "label": "Approve TEKS Alignment",
                "enabled": not bool(approval_packet["classroom_release_ready"]),
            },
            {
                "action_id": "send_back_to_tighten_alignment",
                "label": "Send Back to Tighten Alignment",
                "enabled": True,
            },
        ],
    }


def _release_state(
    approval_packet: dict[str, object],
    readiness_report: dict[str, object],
) -> dict[str, object]:
    if approval_packet["classroom_release_ready"]:
        return {
            "state": "approved",
            "reason": "Teacher review and instructional alignment are both approved.",
        }

    return {
        "state": "blocked",
        "reason": "Teacher review remains incomplete or the TEKS target is still pending.",
        "blockers": list(readiness_report["blockers"]),
    }


def _alignment_label(alignment_manifest, alignment_id: str) -> str:
    for alignment in alignment_manifest.alignments:
        if alignment.alignment_id == alignment_id:
            return alignment.standard_label
    raise MindseyeDataError(f"unknown alignment_id: {alignment_id}")
