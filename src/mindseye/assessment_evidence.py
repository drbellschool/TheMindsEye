from __future__ import annotations

from .mission_seed import build_mission_seed_packet
from .models import TownPackage
from .readiness import build_classroom_readiness_report
from .student_mission import build_student_mission_flow_packet
from .teacher_review import build_teacher_approval_packet


def build_assessment_evidence_packet(
    package: TownPackage,
    mission_id: str | None = None,
) -> dict[str, object]:
    """Build a read-only assessment evidence packet.

    This packet does not score student work. It only defines the evidence trail,
    mastery scale, rubric boundary, and teacher override rule for a mission.
    """
    mission_packet = build_mission_seed_packet(package, mission_id)
    student_flow = build_student_mission_flow_packet(package, mission_id)
    readiness_report = build_classroom_readiness_report(package, mission_id)
    approval_packet = build_teacher_approval_packet(package, mission_id=mission_id)

    return {
        "framework_title": "Assessment Evidence Workflow",
        "mission_id": mission_packet["mission_id"],
        "town_package_id": mission_packet["town_package_id"],
        "artifact_expectation": dict(student_flow["artifact_expectation"]),
        "mastery_scale": _mastery_scale(),
        "gradebook_conversion": {
            "status": "planned",
            "description": "A 1-4 mastery scale can map into a 60-100 interim grade range once grading support exists.",
        },
        "evidence_trail": {
            "teacher_source_notes": list(mission_packet["teacher_source_notes"]),
            "provenance_labels": list(student_flow["provenance_labels"]),
            "locations": list(mission_packet["locations"]),
        },
        "rubric_boundary": {
            "status": "teacher_selected",
            "rubric_uploaded": False,
            "ai_compare_allowed": True,
            "teacher_override_allowed": True,
        },
        "teacher_override_rule": "The teacher can override any automated comparison or mastery interpretation.",
        "student_artifact_types": _student_artifact_types(mission_packet),
        "assessment_status": "not_scored",
        "release_state": "blocked" if not readiness_report["classroom_ready"] else "available",
        "readiness_summary": readiness_report["summary"],
        "teacher_review_state": approval_packet["review_status"],
    }


def _mastery_scale() -> list[dict[str, object]]:
    return [
        {"level": 1, "label": "Beginning", "grade_range": "60-69", "description": "Needs substantial support."},
        {"level": 2, "label": "Developing", "grade_range": "70-79", "description": "Shows partial mastery."},
        {"level": 3, "label": "Proficient", "grade_range": "80-89", "description": "Meets the expectation."},
        {"level": 4, "label": "Advanced", "grade_range": "90-100", "description": "Exceeds the expectation."},
    ]


def _student_artifact_types(mission_packet: dict[str, object]) -> list[str]:
    return [
        "editorial",
        "letter",
        "historical report",
        "mission reflection",
        "teacher-selected rubric-aligned response",
    ]
