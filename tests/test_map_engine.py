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


if __name__ == "__main__":
    unittest.main()
