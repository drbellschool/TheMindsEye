import assert from "node:assert/strict";
import test from "node:test";
import { formatMapPiecePlacementLabel } from "./map-piece-label.ts";

const piece = (patch: Record<string, unknown> = {}) => ({ blockNumberText: null, titleText: null, pieceSequence: 3, ...patch }) as any;

test("formats block number before a meaningful title", () => {
  assert.equal(formatMapPiecePlacementLabel(piece({ blockNumberText: "  BLOCK 71 ", titleText: "Lots of Commerce" })), "Block 71 - Lots of Commerce");
});

test("formats block-only, title-only, and fallback labels", () => {
  assert.equal(formatMapPiecePlacementLabel(piece({ blockNumberText: "71" })), "Block 71");
  assert.equal(formatMapPiecePlacementLabel(piece({ titleText: "Public Well" })), "Public Well");
  assert.equal(formatMapPiecePlacementLabel(piece()), "Feature 03");
});

test("does not duplicate a title that already begins with the block label", () => {
  assert.equal(formatMapPiecePlacementLabel(piece({ blockNumberText: "71", titleText: "Block 71" })), "Block 71");
  assert.equal(formatMapPiecePlacementLabel(piece({ blockNumberText: "71", titleText: "Block 71 - Lots of Commerce" })), "Block 71 - Lots of Commerce");
});
