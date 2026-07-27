import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migration = readFileSync(resolve(process.cwd(), "../../supabase/migrations/0025_birds_eye_perspective_calibration.sql"), "utf8");

test("Birds-Eye migration is additive and edition scoped", () => {
  assert.match(migration, /create table if not exists public\.historical_map_birds_eye_reference_assets/i);
  assert.match(migration, /create table if not exists public\.historical_map_birds_eye_calibrations/i);
  assert.match(migration, /create table if not exists public\.historical_map_birds_eye_control_points/i);
  assert.match(migration, /add column if not exists birds_eye_reference_asset_id/i);
  assert.match(migration, /unique \(atlas_id\)/i);
  assert.match(migration, /jsonb_array_length\(p_control_points\) > 450/i);
  assert.match(migration, /town_package_id = p_town_package_id/i);
  assert.doesNotMatch(migration, /drop table\s+public\./i);
  assert.doesNotMatch(migration, /delete from\s+public\.(sanborn_map_piece|historical_map_workspaces|historical_map_piece_georeferences)/i);
});

