-- PR #101: edition-scoped Birds-Eye reference assets and calibration.
-- Additive only: Sanborn assets, Map Pieces, and geographic placements are unchanged.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'birds-eye-references',
  'birds-eye-references',
  false,
  52428800,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.historical_map_birds_eye_reference_assets (
  id uuid primary key default gen_random_uuid(),
  asset_id text not null unique,
  town_package_id uuid not null references public.town_packages(id) on delete cascade,
  source_record_id uuid references public.source_records(id) on delete set null,
  original_filename text not null,
  storage_bucket text not null default 'birds-eye-references',
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  byte_size bigint not null check (byte_size > 0),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  sha256_checksum text not null check (sha256_checksum ~ '^[a-f0-9]{64}$'),
  evidence_classification review_status_enum not null default 'unknown',
  review_status review_status_enum not null default 'unknown',
  rights_note text,
  intake_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_birds_eye_reference_assets_town on public.historical_map_birds_eye_reference_assets(town_package_id);
create index if not exists idx_birds_eye_reference_assets_source on public.historical_map_birds_eye_reference_assets(source_record_id);

alter table public.sanborn_atlases
  add column if not exists birds_eye_reference_asset_id uuid references public.historical_map_birds_eye_reference_assets(id) on delete set null;

create table if not exists public.historical_map_birds_eye_calibrations (
  id uuid primary key default gen_random_uuid(),
  town_package_id uuid not null references public.town_packages(id) on delete cascade,
  atlas_id uuid not null references public.sanborn_atlases(id) on delete cascade,
  reference_asset_id uuid references public.historical_map_birds_eye_reference_assets(id) on delete set null,
  title text not null default 'Birds-Eye Perspective Calibration',
  calibration_status text not null default 'draft' check (calibration_status in ('draft', 'solved', 'saved', 'needs_review', 'unavailable')),
  unavailable_reason text,
  global_parameters jsonb not null default '{}'::jsonb check (jsonb_typeof(global_parameters) = 'object'),
  warp_type text not null default 'delaunay_piecewise_affine',
  solver_version text not null default 'birds-eye-v1',
  warp_model jsonb not null default '{}'::jsonb check (jsonb_typeof(warp_model) = 'object'),
  quality_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(quality_summary) = 'object'),
  notes text,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (atlas_id)
);

create index if not exists idx_birds_eye_calibrations_town_atlas on public.historical_map_birds_eye_calibrations(town_package_id, atlas_id);

create table if not exists public.historical_map_birds_eye_control_points (
  id uuid primary key default gen_random_uuid(),
  calibration_id uuid not null references public.historical_map_birds_eye_calibrations(id) on delete cascade,
  sequence_number integer not null check (sequence_number > 0),
  label text,
  note text,
  anchor_type text not null default 'other' check (anchor_type in ('intersection', 'railroad_crossing', 'block_corner', 'building_landmark', 'church', 'depot', 'school', 'courthouse', 'water_feature', 'road_bend', 'other')),
  linked_map_piece_id text,
  longitude double precision,
  latitude double precision,
  image_x double precision,
  image_y double precision,
  enabled boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (calibration_id, sequence_number)
);

create index if not exists idx_birds_eye_control_points_calibration on public.historical_map_birds_eye_control_points(calibration_id, sequence_number);

drop trigger if exists set_birds_eye_reference_assets_updated_at on public.historical_map_birds_eye_reference_assets;
create trigger set_birds_eye_reference_assets_updated_at before update on public.historical_map_birds_eye_reference_assets for each row execute function public.set_updated_at();
drop trigger if exists set_birds_eye_calibrations_updated_at on public.historical_map_birds_eye_calibrations;
create trigger set_birds_eye_calibrations_updated_at before update on public.historical_map_birds_eye_calibrations for each row execute function public.set_updated_at();
drop trigger if exists set_birds_eye_control_points_updated_at on public.historical_map_birds_eye_control_points;
create trigger set_birds_eye_control_points_updated_at before update on public.historical_map_birds_eye_control_points for each row execute function public.set_updated_at();

alter table public.historical_map_birds_eye_reference_assets enable row level security;
alter table public.historical_map_birds_eye_calibrations enable row level security;
alter table public.historical_map_birds_eye_control_points enable row level security;
grant select, insert, update, delete on public.historical_map_birds_eye_reference_assets to service_role;
grant select, insert, update, delete on public.historical_map_birds_eye_calibrations to service_role;
grant select, insert, update, delete on public.historical_map_birds_eye_control_points to service_role;

create or replace function public.save_historical_map_birds_eye_calibration(
  p_town_package_id uuid,
  p_atlas_id text,
  p_calibration jsonb,
  p_control_points jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  atlas_row uuid;
  calibration_row uuid;
  reference_asset_row uuid;
  point jsonb;
begin
  select id into atlas_row from public.sanborn_atlases where atlas_id = p_atlas_id and town_package_id = p_town_package_id and archived_at is null;
  if atlas_row is null then raise exception 'Active Sanborn edition was not found for this town.'; end if;
  if jsonb_typeof(p_calibration) <> 'object' or jsonb_typeof(p_control_points) <> 'array' then raise exception 'Birds-Eye calibration payload is invalid.'; end if;
  if coalesce(p_calibration->>'status', 'draft') = 'unavailable' and nullif(trim(p_calibration->>'unavailableReason'), '') is null then raise exception 'Unavailable Birds-Eye calibration requires a reason.'; end if;
  if jsonb_array_length(p_control_points) > 450 then raise exception 'Birds-Eye calibration supports at most 450 control points.'; end if;
  if nullif(p_calibration->>'referenceAssetId', '') is not null then
    select id into reference_asset_row
      from public.historical_map_birds_eye_reference_assets
      where asset_id = p_calibration->>'referenceAssetId'
        and town_package_id = p_town_package_id;
    if reference_asset_row is null then raise exception 'Birds-Eye reference asset is not owned by this town.'; end if;
  end if;
  insert into public.historical_map_birds_eye_calibrations (town_package_id, atlas_id, reference_asset_id, title, calibration_status, unavailable_reason, global_parameters, warp_type, solver_version, warp_model, quality_summary, notes, updated_by)
  values (p_town_package_id, atlas_row, reference_asset_row, coalesce(nullif(p_calibration->>'title', ''), 'Birds-Eye Perspective Calibration'), coalesce(nullif(p_calibration->>'status', ''), 'draft'), nullif(p_calibration->>'unavailableReason', ''), coalesce(p_calibration->'globalParameters', '{}'::jsonb), coalesce(nullif(p_calibration->>'warpType', ''), 'delaunay_piecewise_affine'), coalesce(nullif(p_calibration->>'solverVersion', ''), 'birds-eye-v1'), coalesce(p_calibration->'warpModel', '{}'::jsonb), coalesce(p_calibration->'qualitySummary', '{}'::jsonb), p_calibration->>'notes', p_calibration->>'updatedBy')
  on conflict (atlas_id) do update set reference_asset_id = excluded.reference_asset_id, title = excluded.title, calibration_status = excluded.calibration_status, unavailable_reason = excluded.unavailable_reason, global_parameters = excluded.global_parameters, warp_type = excluded.warp_type, solver_version = excluded.solver_version, warp_model = excluded.warp_model, quality_summary = excluded.quality_summary, notes = excluded.notes, updated_by = excluded.updated_by, updated_at = now()
  returning id into calibration_row;
  update public.historical_map_birds_eye_control_points set deleted_at = now(), updated_at = now() where calibration_id = calibration_row and deleted_at is null;
  for point in select * from jsonb_array_elements(p_control_points) loop
    insert into public.historical_map_birds_eye_control_points (calibration_id, sequence_number, label, note, anchor_type, linked_map_piece_id, longitude, latitude, image_x, image_y, enabled, deleted_at)
    values (calibration_row, (point->>'sequence')::integer, point->>'label', point->>'note', coalesce(nullif(point->>'anchorType', ''), 'other'), nullif(point->>'linkedMapPieceId', ''), (point->>'longitude')::double precision, (point->>'latitude')::double precision, (point->>'imageX')::double precision, (point->>'imageY')::double precision, coalesce((point->>'enabled')::boolean, true), null);
  end loop;
  return jsonb_build_object('ok', true, 'calibrationId', calibration_row);
end;
$$;

revoke execute on function public.save_historical_map_birds_eye_calibration(uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_historical_map_birds_eye_calibration(uuid, text, jsonb, jsonb) to service_role;
