from __future__ import annotations

from .mission_seed import build_mission_seed_packet
from .models import TownPackage
from .readiness import build_classroom_readiness_report


def build_student_mission_flow_packet(
    package: TownPackage,
    mission_id: str | None = None,
) -> dict[str, object]:
    """Build a read-only student mission flow packet.

    This is a presentation contract, not a runtime mission engine. It only
    exposes the current mission seed, visible student-facing evidence trail,
    and the current release gate state from existing package data.
    """
    mission_packet = build_mission_seed_packet(package, mission_id)
    readiness_report = build_classroom_readiness_report(package, mission_id)

    return {
        "flow_title": "Student Mission Flow",
        "mission_id": mission_packet["mission_id"],
        "town_package_id": mission_packet["town_package_id"],
        "release_state": "available" if readiness_report["classroom_ready"] else "blocked",
        "release_reason": readiness_report["summary"],
        "student_objective": _student_objective(mission_packet),
        "visible_mission_steps": _visible_mission_steps(mission_packet),
        "selected_locations": list(mission_packet["locations"]),
        "provenance_labels": list(mission_packet["student_mission_hook"]["provenance_labels"]),
        "evidence_packets": list(mission_packet["teacher_source_notes"]),
        "artifact_expectation": _artifact_expectation(mission_packet),
        "teacher_gate_summary": {
            "classroom_ready": readiness_report["classroom_ready"],
            "blockers": list(readiness_report["blockers"]),
        },
    }


def _student_objective(mission_packet: dict[str, object]) -> str:
    return (
        f"Complete the mission '{mission_packet['title']}' by using "
        "historical evidence, map locations, and teacher-approved standards."
    )


def _visible_mission_steps(mission_packet: dict[str, object]) -> list[dict[str, object]]:
    return [
        {
            "step_id": "orient",
            "label": "Orient to the town and mission",
            "status": "visible",
            "notes": "Students begin with the mission hook, map view, and current location context.",
        },
        {
            "step_id": "inspect",
            "label": "Inspect evidence and labels",
            "status": "visible",
            "notes": "Students inspect source-backed locations, labels, and provenance marks before acting.",
        },
        {
            "step_id": "reason",
            "label": "Reason about the mission problem",
            "status": "visible",
            "notes": "Students compare what is verified, inferred, and fictional gameplay framing.",
        },
        {
            "step_id": "produce",
            "label": "Produce the classroom artifact",
            "status": "visible",
            "notes": "Students complete the artifact expected by the teacher-reviewed mission.",
        },
        {
            "step_id": "reflect",
            "label": "Reflect and submit evidence",
            "status": "visible",
            "notes": "Students submit a final explanation that names the evidence they used.",
        },
    ]


def _artifact_expectation(mission_packet: dict[str, object]) -> dict[str, object]:
    return {
        "label": "Evidence-backed classroom artifact",
        "details": mission_packet["teacher_notes"],
        "provenance_required": True,
    }
