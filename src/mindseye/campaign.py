from __future__ import annotations

from .models import TownPackage


def build_campaign_packet(package: TownPackage) -> dict[str, object]:
    """Build a reusable class-campaign contract from the town package.

    Campaigns are longer instructional containers that organize multiple
    missions. Missions stay atomic. The campaign layer defines the progression
    gate, not the mission text itself.
    """
    map_year = _map_year(package)
    year_gate = _historical_year_gate(map_year)

    return {
        "campaign_id": f"campaign_{package.package_id}_001",
        "town_package_id": package.package_id,
        "town_name": package.town_name,
        "state_region": package.state_region,
        "map_year": map_year,
        "campaign_title": f"{package.town_name} Campaign Framework",
        "campaign_role": "class_unit_container",
        "mission_granularity_rule": "missions remain atomic; campaigns organize sequences of missions and checkpoints.",
        "year_gate": year_gate,
        "mastery_checkpoint_count": 16,
        "mastery_bands": _mastery_bands(),
        "mastery_checkpoints": _mastery_checkpoints(),
        "mission_sequence_model": {
            "preferred_model": "flexible",
            "mission_to_checkpoint_policy": "one mission may advance one or more checkpoints; a checkpoint may also span multiple missions when the teacher wants more practice.",
            "checkpoint_count_is_fixed": True,
            "mission_count_is_fixed": False,
        },
        "preassessment_placement": {
            "placement_rule": "A preassessment places the learner at the first unmet checkpoint.",
            "entry_points": [1, 5, 9, 13],
            "teacher_override_allowed": True,
            "mission_span_rule": "A mission may advance one or more checkpoints when the teacher approves the evidence.",
        },
        "campaign_notes": [
            "Campaigns should cover a broader class unit than a single mission.",
            "Secondary TEKS tethers remain mission-scoped, not the primary campaign identity.",
            "The campaign model must work for any town package, not only Texarkana.",
        ],
        "scope_guard": {
            "town_agnostic": True,
            "texarkana_is_the_current_design_target": True,
        },
    }


def _map_year(package: TownPackage) -> int:
    if package.map_layers and isinstance(package.map_layers[0], dict):
        map_year = package.map_layers[0].get("year")
        if isinstance(map_year, int) and not isinstance(map_year, bool):
            return map_year

    start_year = package.time_window.get("start_year")
    if isinstance(start_year, int) and not isinstance(start_year, bool):
        return start_year
    raise ValueError("town package is missing a usable map year")


def _historical_year_gate(map_year: int) -> dict[str, int | str]:
    return {
        "map_year": map_year,
        "start_year": map_year - 10,
        "end_year": map_year + 10,
        "span_before_years": 10,
        "span_after_years": 10,
        "total_span_years": 20,
        "rule": "Keep campaign content inside a 20-year window centered on the Sanborn map year.",
    }


def _mastery_bands() -> list[dict[str, object]]:
    return [
        {
            "band_number": 1,
            "band_label": "Entry",
            "checkpoint_range": [1, 4],
            "purpose": "Build context, vocabulary, and source orientation.",
        },
        {
            "band_number": 2,
            "band_label": "Develop",
            "checkpoint_range": [5, 8],
            "purpose": "Practice evidence collection and guided application.",
        },
        {
            "band_number": 3,
            "band_label": "Apply",
            "checkpoint_range": [9, 12],
            "purpose": "Use evidence in mission work with increasing independence.",
        },
        {
            "band_number": 4,
            "band_label": "Extend",
            "checkpoint_range": [13, 16],
            "purpose": "Demonstrate mastery, transfer, and teacher-approved synthesis.",
        },
    ]


def _mastery_checkpoints() -> list[dict[str, object]]:
    checkpoints: list[dict[str, object]] = []
    for checkpoint_number in range(1, 17):
        band_number = ((checkpoint_number - 1) // 4) + 1
        band_label = _mastery_bands()[band_number - 1]["band_label"]
        checkpoints.append(
            {
                "checkpoint_id": f"campaign_checkpoint_{checkpoint_number:02d}",
                "checkpoint_number": checkpoint_number,
                "band_number": band_number,
                "band_label": band_label,
                "mission_role": "flexible",
                "assessment_mode": "teacher_reviewed_evidence",
                "notes": _checkpoint_note(checkpoint_number),
            }
        )
    return checkpoints


def _checkpoint_note(checkpoint_number: int) -> str:
    if checkpoint_number in {1, 5, 9, 13}:
        return "Suggested preassessment entry point for a new band."
    if checkpoint_number in {4, 8, 12, 16}:
        return "Band completion point."
    return "Flexible progression point inside the campaign."
