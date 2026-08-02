import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migration = readFileSync(resolve(process.cwd(), "../../supabase/migrations/0025_birds_eye_perspective_calibration.sql"), "utf8");
const sceneMigration = readFileSync(resolve(process.cwd(), "../../supabase/migrations/0026_birds_eye_scene_regions.sql"), "utf8");
const derivedMigration = readFileSync(resolve(process.cwd(), "../../supabase/migrations/0027_birds_eye_derived_map_pieces.sql"), "utf8");

test("PR #111 migration stores approximate Birds-Eye-derived pieces separately from Sanborn", () => {
  assert.match(derivedMigration, /create table if not exists public\.historical_map_birds_eye_derived_map_pieces/i);
  assert.match(derivedMigration, /source_classification text not null default 'birds_eye_derived'/i);
  assert.match(derivedMigration, /placement_precision text not null default 'approximate'/i);
  assert.match(derivedMigration, /source_region_id text not null/i);
  assert.match(derivedMigration, /create or replace function public\.create_birds_eye_derived_map_piece/i);
  assert.match(derivedMigration, /create or replace function public\.save_birds_eye_derived_map_piece_placement/i);
  assert.doesNotMatch(derivedMigration, /drop table\s+public\./i);
  assert.doesNotMatch(derivedMigration, /update\s+public\.(sanborn_map_pieces|historical_map_birds_eye_scene_regions)/i);
});

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

test("PR #107 migration is additive and never writes authoritative Map Placement geometry", () => {
  assert.match(sceneMigration, /create table if not exists public\.historical_map_birds_eye_scene_regions/i);
  assert.match(sceneMigration, /create table if not exists public\.historical_map_birds_eye_piece_presentations/i);
  assert.match(sceneMigration, /add column if not exists source_map_zoom/i);
  assert.match(sceneMigration, /add column if not exists geographic_note/i);
  assert.doesNotMatch(sceneMigration, /drop table\s+public\./i);
  assert.doesNotMatch(sceneMigration, /alter table\s+public\.historical_map_piece_georeferences/i);
  assert.doesNotMatch(sceneMigration, /update\s+public\.(historical_map_piece_georeferences|sanborn_map_pieces|historical_map_georeferences)/i);
  assert.doesNotMatch(sceneMigration, /delete from\s+public\.(historical_map_piece_georeferences|sanborn_map_pieces|historical_map_georeferences)/i);
});

test("scene geometry, types, links, review states, and exact source scope are constrained", () => {
  for (const type of [
    "building",
    "building_group",
    "block",
    "street",
    "railroad",
    "depot",
    "industrial_site",
    "bridge",
    "waterway",
    "vegetation",
    "open_land",
    "landmark",
    "skyline",
    "background",
    "unknown",
  ]) {
    assert.match(sceneMigration, new RegExp(`'${type}'`));
  }
  assert.match(sceneMigration, /coordinate_space is distinct from 'normalized_image'/i);
  assert.match(sceneMigration, /point_x < 0 or point_x > 1/i);
  assert.match(sceneMigration, /distinct_count < 3/i);
  assert.match(sceneMigration, /foreign key \(town_package_id, atlas_id\)/i);
  assert.match(sceneMigration, /foreign key \(town_package_id, reference_asset_id\)/i);
  assert.match(sceneMigration, /linked_map_piece_id text references public\.sanborn_map_pieces\(piece_id\)/i);
  assert.match(sceneMigration, /linked_source_record_id uuid references public\.source_records\(id\)/i);
  assert.match(sceneMigration, /linked_building_id text references public\.buildings\(building_id\)/i);
  assert.match(sceneMigration, /evidence_classification review_status_enum not null default 'unknown'/i);
  assert.match(sceneMigration, /review_status review_status_enum not null default 'unknown'/i);
});

test("scene and presentation storage has requested indexes, RLS, and service-role-only RPCs", () => {
  for (const suffix of ["town", "atlas", "reference", "map_piece", "source", "archived", "type", "review"]) {
    assert.match(sceneMigration, new RegExp(`idx_birds_eye_scene_regions_${suffix}`, "i"));
  }
  assert.match(sceneMigration, /idx_birds_eye_piece_presentations_piece/i);
  assert.match(sceneMigration, /enable row level security/i);
  assert.match(sceneMigration, /revoke all on table public\.historical_map_birds_eye_scene_regions from PUBLIC, anon, authenticated/i);
  assert.match(sceneMigration, /revoke all on table public\.historical_map_birds_eye_piece_presentations from PUBLIC, anon, authenticated/i);
  assert.match(sceneMigration, /save_historical_map_birds_eye_scene_region/i);
  assert.match(sceneMigration, /archive_historical_map_birds_eye_scene_region/i);
  assert.match(sceneMigration, /save_historical_map_birds_eye_piece_presentation/i);
  assert.match(sceneMigration, /save_historical_map_birds_eye_piece_presentations/i);
  assert.match(sceneMigration, /Archived scene regions are read-only/i);
});

test("calibration extension preserves control-point rows and rejects cross-edition Map Piece links", () => {
  assert.match(sceneMigration, /on conflict \(calibration_id, sequence_number\) do update/i);
  assert.match(sceneMigration, /deleted_at = null/i);
  assert.match(sceneMigration, /pointIds/i);
  assert.match(sceneMigration, /Linked control-point Map Piece must belong to the selected edition/i);
  assert.match(sceneMigration, /calibration reference must be the reference designated for this edition/i);
  assert.doesNotMatch(sceneMigration, /create table if not exists public\.[^(]*control_points/i);
});

test("presentation persistence keeps projected and adjusted geometry separate and protects archives", () => {
  assert.match(sceneMigration, /projected_image_geometry jsonb not null/i);
  assert.match(sceneMigration, /adjusted_image_geometry jsonb/i);
  assert.match(sceneMigration, /source_geographic_geometry_checksum text/i);
  assert.match(sceneMigration, /Archived piece presentations are read-only/i);
  assert.match(sceneMigration, /Scene-region reference must be the reference designated for this edition/i);
  assert.match(sceneMigration, /Piece-presentation reference must be the reference designated for this edition/i);
  assert.doesNotMatch(sceneMigration, /set\s+(latitude|longitude|corners|geographic_geometry|placement_status)\s*=/i);
});

