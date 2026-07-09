from __future__ import annotations

from .models import LocationRecord, MindseyeDataError, TownPackage
from .map_rendering import build_map_rendering_packet


class UnknownLocationError(MindseyeDataError):
    """Raised when a map action references an unknown location ID."""


class MapEngine:
    """Minimal map/location scaffold for the Texarkana vertical slice.

    The engine intentionally resolves only known package locations. Future work
    can add streets, adjacency, movement rules, and Sanborn sheet geometry here.
    """

    def __init__(self, package: TownPackage):
        self.package = package
        self._locations = {location.location_id: location for location in package.locations}

    def get_location(self, location_id: str) -> LocationRecord:
        try:
            return self._locations[location_id]
        except KeyError as exc:
            raise UnknownLocationError(f"unknown location_id: {location_id}") from exc

    def list_locations(self) -> list[dict[str, object]]:
        return [
            {
                "location_id": location.location_id,
                "label": location.label,
                "street": location.street,
                "location_type": location.location_type,
                "certainty": location.certainty,
            }
            for location in self.package.locations
        ]

    def explain_location_evidence(self, location_id: str) -> dict[str, object]:
        location = self.get_location(location_id)
        sources = [source for source in self.package.sources if source.source_id in location.source_ids]
        return {
            "location_id": location.location_id,
            "label": location.label,
            "certainty": location.certainty,
            "source_ids": list(location.source_ids),
            "citations": [source.citation for source in sources],
        }

    def build_render_packet(self) -> dict[str, object]:
        """Return the current read-only map rendering contract."""
        return build_map_rendering_packet(self.package)
