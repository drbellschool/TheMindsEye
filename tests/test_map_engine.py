from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import load_town_package
from mindseye.map_engine import MapEngine, UnknownLocationError


class MapEngineTests(unittest.TestCase):
    def test_lists_known_locations(self):
        package = load_town_package(ROOT, "texarkana")
        engine = MapEngine(package)
        locations = engine.list_locations()

        self.assertGreaterEqual(len(locations), 1)
        self.assertIn("location_id", locations[0])

    def test_explains_location_evidence(self):
        package = load_town_package(ROOT, "texarkana")
        engine = MapEngine(package)
        evidence = engine.explain_location_evidence("loc_texarkana_1885_001")

        self.assertEqual(evidence["location_id"], "loc_texarkana_1885_001")
        self.assertGreaterEqual(len(evidence["citations"]), 1)

    def test_unknown_location_fails_instead_of_hallucinating(self):
        package = load_town_package(ROOT, "texarkana")
        engine = MapEngine(package)

        with self.assertRaises(UnknownLocationError):
            engine.get_location("loc_does_not_exist")

    def test_build_render_packet_separates_contract_layers(self):
        package = load_town_package(ROOT, "texarkana")
        engine = MapEngine(package)
        packet = engine.build_render_packet()

        self.assertEqual(packet["town_package_id"], "texarkana_1885")
        self.assertEqual(packet["base_map_layer"]["layer_id"], "base-map")
        self.assertEqual(packet["road_rail_layer"]["status"], "deferred")
        self.assertEqual(packet["building_footprint_layer"]["layer_id"], "building-footprints")
        self.assertEqual(packet["building_art_layer"]["layer_id"], "building-art")
        self.assertEqual(packet["building_art_layer"]["status"], "reviewed_subset_available")
        self.assertGreaterEqual(len(packet["building_art_layer"]["records"]), 1)
        self.assertGreaterEqual(len(packet["building_art_layer"]["fallback_records"]), 1)
        self.assertEqual(packet["label_layer"]["layer_id"], "labels")
        self.assertEqual(packet["quest_marker_layer"]["layer_id"], "quest-markers")
        self.assertEqual(packet["evidence_provenance_layer"]["layer_id"], "evidence-provenance")
        self.assertEqual(
            packet["evidence_provenance_layer"]["teacher_review_manifest_id"],
            "teacher_review_texarkana_1885_mission_001",
        )


if __name__ == "__main__":
    unittest.main()
