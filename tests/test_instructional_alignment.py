import json
import shutil
from pathlib import Path
import sys
import tempfile
import unittest
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import MindseyeDataError, load_instructional_alignment_manifest  # noqa: E402

SCHEMAS = ROOT / "data" / "schemas"
TEXARKANA = ROOT / "data" / "towns" / "texarkana"


class InstructionalAlignmentTests(unittest.TestCase):
    def test_loads_instructional_alignment_manifest(self):
        manifest = load_instructional_alignment_manifest(ROOT, "texarkana")
        alignments_by_id = {alignment.alignment_id: alignment for alignment in manifest.alignments}

        self.assertEqual(
            manifest.instructional_manifest_id,
            "instructional_texarkana_1885_mission_001",
        )
        self.assertEqual(manifest.mission_id, "mission_texarkana_1885_001")
        self.assertEqual(manifest.hqim_status, "framework_seeded")
        self.assertEqual(manifest.teks_status, "pending_teacher_selection")
        self.assertEqual(manifest.record_count, 2)

        hqim_alignment = alignments_by_id["alignment_texarkana_1885_hqim_001"]
        self.assertEqual(hqim_alignment.framework, "HQIM")
        self.assertEqual(hqim_alignment.alignment_status, "framework_seed")
        self.assertIsNone(hqim_alignment.standard_id)
        self.assertTrue(hqim_alignment.teacher_review_required)

        teks_alignment = alignments_by_id["alignment_texarkana_1885_teks_001"]
        self.assertEqual(teks_alignment.framework, "TEKS")
        self.assertEqual(teks_alignment.alignment_status, "pending_teacher_selection")
        self.assertIsNone(teks_alignment.standard_id)
        self.assertTrue(teks_alignment.teacher_review_required)

    def test_rejects_missing_hqim_record(self):
        with copied_repo() as repo_root:
            mutate_json(
                repo_root / "data" / "towns" / "texarkana" / "instructional_alignment_manifest.json",
                lambda manifest: manifest.__setitem__(
                    "alignments",
                    [alignment for alignment in manifest["alignments"] if alignment["framework"] != "HQIM"],
                ),
            )
            mutate_json(
                repo_root / "data" / "towns" / "texarkana" / "instructional_alignment_manifest.json",
                lambda manifest: manifest.__setitem__("record_count", len(manifest["alignments"])),
            )

            with self.assertRaisesRegex(MindseyeDataError, "HQIM"):
                load_instructional_alignment_manifest(repo_root, "texarkana")

    def test_rejects_pending_teks_record_with_standard_id(self):
        with copied_repo() as repo_root:
            mutate_json(
                repo_root / "data" / "towns" / "texarkana" / "instructional_alignment_manifest.json",
                lambda manifest: manifest["alignments"][1].__setitem__("standard_id", "113.20"),
            )

            with self.assertRaisesRegex(MindseyeDataError, "cannot set standard_id"):
                load_instructional_alignment_manifest(repo_root, "texarkana")


@contextmanager
def copied_repo() -> Iterator[Path]:
    with tempfile.TemporaryDirectory() as temp_dir:
        repo_root = Path(temp_dir)
        data_dir = repo_root / "data"
        (data_dir / "towns").mkdir(parents=True)
        shutil.copytree(SCHEMAS, data_dir / "schemas")
        shutil.copytree(TEXARKANA, data_dir / "towns" / "texarkana")
        yield repo_root


def mutate_json(path: Path, mutation: Callable[[Any], None]) -> None:
    data = json.loads(path.read_text(encoding="utf-8"))
    mutation(data)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    unittest.main()
