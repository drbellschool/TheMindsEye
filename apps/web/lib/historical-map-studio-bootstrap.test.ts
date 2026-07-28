import assert from "node:assert/strict";
import test from "node:test";
import { historicalMapStudioEditionKey, isAuthoritativeHistoricalMapStudioBootstrap } from "./historical-map-studio-bootstrap.ts";

test("bootstrap identity is edition scoped", () => {
  assert.equal(historicalMapStudioEditionKey({ townPackageId: "town", mapYear: 1888, atlasId: "atlas" }), "town:1888:atlas");
});

test("bootstrap rejects a response for another town or year", () => {
  const state = { activeTownPackage: { id: "town" }, activeMapYear: 1888 } as never;
  assert.equal(isAuthoritativeHistoricalMapStudioBootstrap(state, { townPackageId: "town", mapYear: 1888 }), true);
  assert.equal(isAuthoritativeHistoricalMapStudioBootstrap(state, { townPackageId: "other", mapYear: 1888 }), false);
  assert.equal(isAuthoritativeHistoricalMapStudioBootstrap(state, { townPackageId: "town", mapYear: 1889 }), false);
});
