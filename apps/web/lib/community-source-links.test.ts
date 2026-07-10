import assert from "node:assert/strict";
import test from "node:test";

import { isValidSourceId, normalizeSourceLink, normalizeSourceLinks } from "./community-source-links.ts";

test("normalizes a valid source relationship into a source-detail route link", () => {
  const link = normalizeSourceLink({
    sourceId: "source_texarkana_1885_sanborn_loc",
    title: "Sanborn map",
    archiveName: "Library of Congress",
  });

  assert.equal(link?.href, "/community/sources/source_texarkana_1885_sanborn_loc");
  assert.equal(link?.title, "Sanborn map");
  assert.equal(link?.detail, "Library of Congress");
});

test("missing source relationships do not create links", () => {
  assert.equal(normalizeSourceLink({ sourceId: null }), null);
  assert.deepEqual(normalizeSourceLinks([{ sourceId: undefined }]), []);
});

test("duplicate source relationships collapse to one link", () => {
  const links = normalizeSourceLinks([
    { sourceId: "source_texarkana_1885_sanborn_loc", title: "First title" },
    { sourceId: "source_texarkana_1885_sanborn_loc", title: "Second title" },
  ]);

  assert.equal(links.length, 1);
  assert.equal(links[0]?.title, "First title");
});

test("invalid source identifiers do not create broken route links", () => {
  const invalidSourceIds = ["", "unknown", "No source loaded", "source/with/slash", "source with spaces", "source?query"];

  for (const sourceId of invalidSourceIds) {
    assert.equal(isValidSourceId(sourceId), false);
    assert.equal(normalizeSourceLink({ sourceId }), null);
  }
});
