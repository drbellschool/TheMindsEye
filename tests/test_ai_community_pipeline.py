from __future__ import annotations

import json
import shutil
import tempfile
from contextlib import contextmanager
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import (  # noqa: E402
    EVIDENCE_PROMPT_ID,
    MindseyeDataError,
    VISUAL_PROMPT_ID,
    load_asset_generation_queue,
)

SCHEMAS = ROOT / "data" / "schemas"
TEXARKANA = ROOT / "data" / "towns" / "texarkana"


class AICommunityPipelineTests(unittest.TestCase):
    def test_loads_queue_and_enforces_stub_only_mode(self) -> None:
        queue = load_asset_generation_queue(ROOT, "texarkana")

        self.assertEqual(queue.queue_id, "asset_generation_queue_texarkana_1885")
        self.assertEqual(queue.execution_mode, "stub_only")
        self.assertFalse(queue.live_api_enabled)
        self.assertEqual(queue.request_count, len(queue.requests))
        self.assertEqual(queue.pipeline_counts["evidence_assistant"], 5)
        self.assertEqual(queue.pipeline_counts["visual_asset"], 8)
        self.assertEqual(queue.map_year, 1885)

    def test_evidence_requests_stay_candidate_pending_review(self) -> None:
        queue = load_asset_generation_queue(ROOT, "texarkana")
        evidence_requests = [request for request in queue.requests if request.pipeline == "evidence_assistant"]

        self.assertEqual(len(evidence_requests), 5)
        self.assertIn("candidate_source_link", {request.request_kind for request in evidence_requests})
        for request in evidence_requests:
            self.assertEqual(request.prompt_id, EVIDENCE_PROMPT_ID)
            self.assertEqual(request.output_status, "candidate_pending_review")
            self.assertEqual(request.review_state, "pending_review")
            self.assertTrue(request.candidate_label)
            self.assertTrue(request.candidate_summary)
            self.assertTrue(request.source_ids)
            self.assertFalse(request.style)
            self.assertFalse(request.dimensions)
            self.assertIsNone(request.transparent_background)
            self.assertFalse(request.intended_layer)

    def test_visual_requests_require_layered_asset_fields(self) -> None:
        queue = load_asset_generation_queue(ROOT, "texarkana")
        visual_requests = [request for request in queue.requests if request.pipeline == "visual_asset"]
        asset_names = {request.asset_name for request in visual_requests}

        self.assertEqual(
            asset_names,
            {
                "sawmill",
                "cotton seed oil mill",
                "railroad depot",
                "livery/wagon yard",
                "parchment UI texture",
                "dirt road texture",
                "grass/brush texture",
                "rail line texture",
            },
        )
        for request in visual_requests:
            self.assertEqual(request.prompt_id, VISUAL_PROMPT_ID)
            self.assertEqual(request.output_status, "illustrative")
            self.assertEqual(request.review_state, "pending_review")
            self.assertTrue(request.style)
            self.assertIn("width", request.dimensions)
            self.assertIn("height", request.dimensions)
            self.assertTrue(request.transparent_background is True or request.transparent_background is False)
            self.assertTrue(request.intended_layer)
            self.assertTrue(request.provenance_notes)
            self.assertTrue(request.source_ids)

    def test_prompt_headers_have_stable_ids(self) -> None:
        evidence_prompt = (
            ROOT
            / "src"
            / "mindseye"
            / "ai"
            / "prompts"
            / "knowledge"
            / "prompt_community_evidence_assistant_v001.md"
        )
        visual_prompt = (
            ROOT
            / "src"
            / "mindseye"
            / "ai"
            / "prompts"
            / "map"
            / "prompt_community_visual_asset_v001.md"
        )

        evidence_text = evidence_prompt.read_text(encoding="utf-8")
        visual_text = visual_prompt.read_text(encoding="utf-8")

        self.assertIn("prompt_id: prompt_community_evidence_assistant_v001", evidence_text)
        self.assertIn("prompt_id: prompt_community_visual_asset_v001", visual_text)
        self.assertIn("requires_provenance: true", evidence_text)
        self.assertIn("requires_provenance: true", visual_text)

    def test_rejects_live_api_enablement(self) -> None:
        with copied_repo() as repo_root:
            mutate_json(
                repo_root / "data" / "towns" / "texarkana" / "asset_generation_queue.json",
                lambda queue: queue.__setitem__("live_api_enabled", True),
            )

            with self.assertRaisesRegex(MindseyeDataError, "live_api"):
                load_asset_generation_queue(repo_root, "texarkana")

    def test_rejects_missing_source_reference(self) -> None:
        with copied_repo() as repo_root:
            mutate_json(
                repo_root / "data" / "towns" / "texarkana" / "asset_generation_queue.json",
                lambda queue: queue["requests"][0].__setitem__("source_ids", []),
            )

            with self.assertRaisesRegex(MindseyeDataError, "needs at least one source"):
                load_asset_generation_queue(repo_root, "texarkana")


@contextmanager
def copied_repo() -> Path:
    with tempfile.TemporaryDirectory() as temp_dir:
        repo_root = Path(temp_dir)
        data_dir = repo_root / "data"
        (data_dir / "towns").mkdir(parents=True)
        shutil.copytree(SCHEMAS, data_dir / "schemas")
        shutil.copytree(TEXARKANA, data_dir / "towns" / "texarkana")
        yield repo_root


def mutate_json(path: Path, mutation) -> None:
    data = json.loads(path.read_text(encoding="utf-8"))
    mutation(data)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    unittest.main()
