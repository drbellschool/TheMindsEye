from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ValidationSmokeTests(unittest.TestCase):
    def test_texarkana_metadata_has_package_id(self) -> None:
        metadata_path = ROOT / "data" / "towns" / "texarkana" / "metadata.json"
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))

        self.assertEqual(metadata["package_id"], "texarkana_1885")


if __name__ == "__main__":
    unittest.main()
