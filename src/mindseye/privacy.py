from __future__ import annotations

from .mission_seed import build_mission_seed_packet
from .models import TownPackage
from .readiness import build_classroom_readiness_report


def build_privacy_baseline_packet(
    package: TownPackage,
    mission_id: str | None = None,
) -> dict[str, object]:
    """Build a read-only privacy baseline packet.

    This is a pilot-safety contract. It does not collect student PII, create
    saved student profiles, or implement production analytics.
    """
    mission_packet = build_mission_seed_packet(package, mission_id)
    readiness_report = build_classroom_readiness_report(package, mission_id)

    return {
        "framework_title": "Pilot Privacy Baseline",
        "mission_id": mission_packet["mission_id"],
        "town_package_id": mission_packet["town_package_id"],
        "privacy_status": "seeded",
        "release_state": "blocked" if not readiness_report["classroom_ready"] else "available",
        "no_pii_default": True,
        "retention_posture": "no_saved_student_profiles",
        "data_minimization_rule": "Collect only what is necessary for instruction and teacher review, and avoid student PII in the prototype.",
        "access_controls": [
            {
                "control_id": "teacher_authority",
                "label": "Teacher Authority",
                "status": "seeded",
                "note": "The teacher remains the final authority over classroom use and review.",
            },
            {
                "control_id": "student_profile_storage",
                "label": "Student Profile Storage",
                "status": "blocked",
                "note": "Production student profiles are out of scope for the prototype.",
            },
            {
                "control_id": "usage_analytics",
                "label": "Usage Analytics",
                "status": "seeded",
                "note": "Any future analytics must avoid exposing student PII unless absolutely necessary.",
            },
            {
                "control_id": "deletion_requests",
                "label": "Deletion Requests",
                "status": "planned",
                "note": "Pilot materials should explain how deletion and retention requests are handled before use.",
            },
        ],
        "pilot_material_notes": [
            "Pilot materials should explain AI limitations.",
            "Pilot materials should document what data is collected and why.",
            "Pilot materials should describe who can access the data and for how long.",
        ],
        "retention_notes": [
            "No unnecessary student data should be stored in the prototype.",
            "If a pilot later collects student work, the retention and deletion policy must be documented first.",
        ],
        "teacher_final_authority": True,
        "ai_limitations_note": "AI can draft and organize, but it must not silently replace teacher judgment or hide uncertainty.",
        "privacy_boundary": {
            "student_names": False,
            "student_ids": False,
            "grades": False,
            "saved_writing_profiles": False,
        },
        "readiness_summary": readiness_report["summary"],
    }
