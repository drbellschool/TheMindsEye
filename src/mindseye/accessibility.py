from __future__ import annotations

from .mission_seed import build_mission_seed_packet
from .models import TownPackage
from .readiness import build_classroom_readiness_report
from .student_mission import build_student_mission_flow_packet


def build_accessibility_support_packet(
    package: TownPackage,
    mission_id: str | None = None,
) -> dict[str, object]:
    """Build a read-only accessibility-support packet.

    This is a contract for mission and dashboard scaffolding. It does not infer
    individual student needs and it does not substitute for teacher-defined
    accommodations.
    """
    mission_packet = build_mission_seed_packet(package, mission_id)
    student_flow = build_student_mission_flow_packet(package, mission_id)
    readiness_report = build_classroom_readiness_report(package, mission_id)

    return {
        "framework_title": "Accessibility Supports",
        "mission_id": mission_packet["mission_id"],
        "town_package_id": mission_packet["town_package_id"],
        "accessibility_status": "seeded",
        "release_state": "blocked" if not readiness_report["classroom_ready"] else "available",
        "embedded_support_rule": "Accessibility supports should be built into mission generation and student experience, not added afterward.",
        "support_categories": _support_categories(),
        "teacher_notes": _teacher_notes(student_flow),
        "mission_scaffold_notes": [
            "Use the mission hook and visible evidence trail to support vocabulary coaching.",
            "Keep translation and scaffold prompts visible to teachers, not hidden in scoring logic.",
            "Treat accommodations as teacher-configured supports rather than inferred student traits.",
        ],
        "release_summary": readiness_report["summary"],
        "support_boundary": {
            "teacher_authority": True,
            "student_profile_inference": False,
            "dynamic_scoring": False,
        },
    }


def _support_categories() -> list[dict[str, object]]:
    return [
        {
            "support_id": "504_supports",
            "label": "504 Supports",
            "status": "planned",
            "note": "Keep accommodation guidance visible without exposing private student records.",
        },
        {
            "support_id": "sped_supports",
            "label": "Special Education Supports",
            "status": "planned",
            "note": "Scaffolds should support access to evidence, reading, and response tasks.",
        },
        {
            "support_id": "els_supports",
            "label": "English Learner Supports",
            "status": "planned",
            "note": "Translation and vocabulary support should stay mission-aware and teacher-directed.",
        },
        {
            "support_id": "vocabulary_coaching",
            "label": "Vocabulary Coaching",
            "status": "seeded",
            "note": "Mission terms should be scaffolded before the student is expected to use them independently.",
        },
        {
            "support_id": "translation_support",
            "label": "Translation",
            "status": "planned",
            "note": "Translation support must remain teacher-managed and mission-scoped.",
        },
        {
            "support_id": "embedded_scaffolds",
            "label": "Embedded Scaffolds",
            "status": "seeded",
            "note": "Hints, sentence stems, and evidence prompts belong in the mission flow.",
        },
        {
            "support_id": "teacher_accommodations",
            "label": "Teacher Accommodations",
            "status": "seeded",
            "note": "Teachers need a way to surface accommodations without changing the historical boundary.",
        },
    ]


def _teacher_notes(student_flow: dict[str, object]) -> list[str]:
    return [
        f"Student mission flow is currently {student_flow['release_state']} and remains explainable.",
        "Accessibility support scaffolding should be visible in the teacher-facing review surface.",
        "The repository should not infer student needs from the mission packet alone.",
    ]
