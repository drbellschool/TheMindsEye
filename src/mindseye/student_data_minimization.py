from __future__ import annotations

from .mission_seed import build_mission_seed_packet
from .models import TownPackage
from .privacy import build_privacy_baseline_packet
from .readiness import build_classroom_readiness_report


def build_student_data_minimization_packet(
    package: TownPackage,
    mission_id: str | None = None,
) -> dict[str, object]:
    """Build a read-only student-data minimization packet.

    This packet defines the pilot boundary for collection, access, and
    retention. It does not implement rostering, analytics, or student profiles.
    """
    mission_packet = build_mission_seed_packet(package, mission_id)
    privacy_packet = build_privacy_baseline_packet(package, mission_id)
    readiness_report = build_classroom_readiness_report(package, mission_id)

    return {
        "framework_title": "Student Data Minimization Plan",
        "mission_id": mission_packet["mission_id"],
        "town_package_id": mission_packet["town_package_id"],
        "minimization_status": "seeded",
        "release_state": "blocked" if not readiness_report["classroom_ready"] else "available",
        "collection_strategy": "instructional_minimum",
        "purpose_limitation": "Collect only the minimum data needed to support the mission, teacher review, and pilot feedback.",
        "storage_limitation": "Do not create saved student profiles or unnecessary persisted student records in the prototype.",
        "access_limitation": "Teacher review data remains the primary visible record; student data should not be broadly exposed.",
        "default_collections": _default_collections(),
        "conditional_collections": _conditional_collections(),
        "prohibited_collections": _prohibited_collections(),
        "retention_controls": _retention_controls(),
        "teacher_controls": _teacher_controls(),
        "pilot_questions": _pilot_questions(),
        "privacy_alignment": {
            "no_pii_default": bool(privacy_packet["no_pii_default"]),
            "teacher_final_authority": bool(privacy_packet["teacher_final_authority"]),
            "retention_posture": privacy_packet["retention_posture"],
        },
        "student_data_boundary": {
            "student_names": False,
            "student_ids": False,
            "grades": False,
            "contact_info": False,
            "home_address": False,
            "saved_writing_profiles": False,
            "analytics_profiles": False,
        },
        "readiness_summary": readiness_report["summary"],
    }


def _default_collections() -> list[dict[str, object]]:
    return [
        {
            "data_type": "mission responses",
            "status": "planned",
            "why_needed": "Only if a teacher is reviewing a classroom artifact for evidence.",
        },
        {
            "data_type": "teacher notes",
            "status": "seeded",
            "why_needed": "Teacher commentary is part of the instructional record.",
        },
        {
            "data_type": "source citations",
            "status": "seeded",
            "why_needed": "Citations are needed to explain mission evidence and provenance.",
        },
    ]


def _conditional_collections() -> list[dict[str, object]]:
    return [
        {
            "data_type": "student artifact text",
            "status": "teacher-controlled",
            "why_needed": "A teacher may need to review a student artifact for rubric-based feedback.",
        },
        {
            "data_type": "temporary session progress",
            "status": "teacher-controlled",
            "why_needed": "A pilot may show current task progress without storing long-lived profiles.",
        },
        {
            "data_type": "support flags",
            "status": "teacher-controlled",
            "why_needed": "Accessibility or accommodation notes should be entered by the teacher, not inferred.",
        },
    ]


def _prohibited_collections() -> list[str]:
    return [
        "student names",
        "student IDs",
        "student grades",
        "student profile records",
        "saved writing histories",
        "home addresses",
        "contact information",
        "always-on analytics profiles",
    ]


def _retention_controls() -> list[dict[str, object]]:
    return [
        {
            "control_id": "session_only_progress",
            "label": "Session-only progress",
            "status": "planned",
            "note": "If progress is tracked in a pilot, it should be ephemeral unless a teacher explicitly keeps it.",
        },
        {
            "control_id": "teacher_review_records",
            "label": "Teacher review records",
            "status": "seeded",
            "note": "Teacher review packets may persist because they are part of the instructional record.",
        },
        {
            "control_id": "deletion_requests",
            "label": "Deletion requests",
            "status": "planned",
            "note": "The pilot should explain how deletion requests are handled before use.",
        },
    ]


def _teacher_controls() -> list[str]:
    return [
        "Teachers decide whether any student artifact is retained beyond the session.",
        "Teachers decide whether an accommodation note is recorded.",
        "Teachers decide whether pilot feedback data is kept for later review.",
    ]


def _pilot_questions() -> list[str]:
    return [
        "What data is collected?",
        "Why is the data needed?",
        "Who can access it?",
        "How long is it retained?",
        "How are deletion requests handled?",
    ]
