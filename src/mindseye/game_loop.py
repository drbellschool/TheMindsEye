from __future__ import annotations

from dataclasses import dataclass, field

from .map_engine import MapEngine
from .models import MindseyeDataError, TownPackage


@dataclass
class MissionRun:
    package: TownPackage
    mission_id: str
    team_locations: dict[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.mission_id != self.package.mission_seed.mission_id:
            raise MindseyeDataError(f"unknown mission_id: {self.mission_id}")
        self.map_engine = MapEngine(self.package)

    def move_team_to_location(self, team_id: str, location_id: str) -> None:
        self.map_engine.get_location(location_id)
        self.team_locations[team_id] = location_id

    def location_evidence_for_team(self, team_id: str) -> dict[str, object]:
        location_id = self.team_locations.get(team_id)
        if not location_id:
            raise MindseyeDataError(f"team has no current location: {team_id}")
        return self.map_engine.explain_location_evidence(location_id)
