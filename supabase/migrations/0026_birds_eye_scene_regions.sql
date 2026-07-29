-- PR #107: Birds-Eye scene markup and presentation geometry.
-- Additive only. Map Placement and Sanborn source geometry remain authoritative
-- and are never updated by the functions in this migration.

create or replace function public.birds_eye_normalized_image_geometry_is_valid(
  p_geometry jsonb,
  p_polygon_only boolean default false
)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  geometry_type text;
  coordinate_space text;
  coordinate_count integer;
  distinct_count integer;
  coordinate jsonb;
  point_x double precision;
  point_y double precision;
  first_x double precision;
  first_y double precision;
  previous_x double precision;
  previous_y double precision;
  area_sum double precision := 0;
begin
  if p_geometry is null or jsonb_typeof(p_geometry) is distinct from 'object' then return false; end if;
  geometry_type := p_geometry ->> 'geometryType';
  coordinate_space := p_geometry ->> 'coordinateSpace';
  if coordinate_space is distinct from 'normalized_image' then return false; end if;
  if geometry_type is null or geometry_type not in ('polygon', 'polyline', 'point') then return false; end if;
  if p_polygon_only and geometry_type <> 'polygon' then return false; end if;
  if jsonb_typeof(p_geometry -> 'coordinates') is distinct from 'array' then return false; end if;
  coordinate_count := jsonb_array_length(p_geometry -> 'coordinates');
  if (geometry_type = 'polygon' and coordinate_count < 3)
    or (geometry_type = 'polyline' and coordinate_count < 2)
    or (geometry_type = 'point' and coordinate_count < 1) then
    return false;
  end if;

  select count(*)
  into distinct_count
  from (
    select distinct
      round(((value ->> 'x')::numeric), 7),
      round(((value ->> 'y')::numeric), 7)
    from jsonb_array_elements(p_geometry -> 'coordinates')
    where jsonb_typeof(value) = 'object'
      and jsonb_typeof(value -> 'x') = 'number'
      and jsonb_typeof(value -> 'y') = 'number'
  ) as distinct_coordinates;

  if (geometry_type = 'polygon' and distinct_count < 3)
    or (geometry_type = 'polyline' and distinct_count < 2)
    or (geometry_type = 'point' and distinct_count < 1) then
    return false;
  end if;

  for coordinate in select value from jsonb_array_elements(p_geometry -> 'coordinates') loop
    if jsonb_typeof(coordinate) is distinct from 'object'
      or jsonb_typeof(coordinate -> 'x') is distinct from 'number'
      or jsonb_typeof(coordinate -> 'y') is distinct from 'number' then
      return false;
    end if;
    point_x := (coordinate ->> 'x')::double precision;
    point_y := (coordinate ->> 'y')::double precision;
    if point_x < 0 or point_x > 1
      or point_y < 0 or point_y > 1 then
      return false;
    end if;
    if first_x is null then
      first_x := point_x;
      first_y := point_y;
    elsif geometry_type = 'polygon' then
      area_sum := area_sum + previous_x * point_y - point_x * previous_y;
    end if;
    previous_x := point_x;
    previous_y := point_y;
  end loop;

  if geometry_type = 'polygon' then
    area_sum := area_sum + previous_x * first_y - first_x * previous_y;
    if abs(area_sum) <= 0.0000001 then return false; end if;
  end if;
  return true;
exception
  when others then return false;
end;
$$;

create or replace function public.birds_eye_normalized_crop_bounds_is_valid(p_bounds jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  bound_x double precision;
  bound_y double precision;
  bound_width double precision;
  bound_height double precision;
begin
  if p_bounds is null then return true; end if;
  if jsonb_typeof(p_bounds) is distinct from 'object'
    or p_bounds ->> 'coordinateSpace' is distinct from 'normalized_image'
    or jsonb_typeof(p_bounds -> 'x') is distinct from 'number'
    or jsonb_typeof(p_bounds -> 'y') is distinct from 'number'
    or jsonb_typeof(p_bounds -> 'width') is distinct from 'number'
    or jsonb_typeof(p_bounds -> 'height') is distinct from 'number' then
    return false;
  end if;
  bound_x := (p_bounds ->> 'x')::double precision;
  bound_y := (p_bounds ->> 'y')::double precision;
  bound_width := (p_bounds ->> 'width')::double precision;
  bound_height := (p_bounds ->> 'height')::double precision;
  return bound_x between 0 and 1
    and bound_y between 0 and 1
    and bound_width > 0
    and bound_height > 0
    and bound_x + bound_width <= 1.0000001
    and bound_y + bound_height <= 1.0000001;
exception
  when others then return false;
end;
$$;

alter table public.historical_map_birds_eye_control_points
  add column if not exists source_map_zoom double precision,
  add column if not exists source_map_bearing double precision,
  add column if not exists source_map_label text,
  add column if not exists historical_image_note text,
  add column if not exists geographic_note text;

create unique index if not exists idx_sanborn_atlases_town_atlas_id
on public.sanborn_atlases(town_package_id, atlas_id);

create unique index if not exists idx_birds_eye_reference_assets_town_asset_id
on public.historical_map_birds_eye_reference_assets(town_package_id, asset_id);

create table if not exists public.historical_map_birds_eye_scene_regions (
  id uuid primary key default gen_random_uuid(),
  region_id text not null unique,
  town_package_id uuid not null references public.town_packages(id) on delete cascade,
  atlas_id text not null,
  reference_asset_id text not null,
  region_type text not null check (region_type in (
    'building', 'building_group', 'block', 'street', 'railroad', 'depot',
    'industrial_site', 'bridge', 'waterway', 'vegetation', 'open_land',
    'landmark', 'skyline', 'background', 'unknown'
  )),
  label text not null check (length(trim(label)) > 0),
  description text,
  image_geometry jsonb not null check (public.birds_eye_normalized_image_geometry_is_valid(image_geometry, true)),
  linked_map_piece_id text references public.sanborn_map_pieces(piece_id) on delete set null,
  linked_source_record_id uuid references public.source_records(id) on delete set null,
  linked_building_id text references public.buildings(building_id) on delete set null,
  evidence_classification review_status_enum not null default 'unknown',
  review_status review_status_enum not null default 'unknown',
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  visible_features jsonb not null default '{}'::jsonb check (jsonb_typeof(visible_features) = 'object'),
  reconstruction_notes text,
  rendering_notes text,
  crop_bounds jsonb check (public.birds_eye_normalized_crop_bounds_is_valid(crop_bounds)),
  is_visible boolean not null default true,
  is_locked boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint birds_eye_scene_region_edition_scope
    foreign key (town_package_id, atlas_id)
    references public.sanborn_atlases(town_package_id, atlas_id)
    on delete cascade,
  constraint birds_eye_scene_region_reference_scope
    foreign key (town_package_id, reference_asset_id)
    references public.historical_map_birds_eye_reference_assets(town_package_id, asset_id)
    on delete restrict
);

create index if not exists idx_birds_eye_scene_regions_town on public.historical_map_birds_eye_scene_regions(town_package_id);
create index if not exists idx_birds_eye_scene_regions_atlas on public.historical_map_birds_eye_scene_regions(atlas_id);
create index if not exists idx_birds_eye_scene_regions_reference on public.historical_map_birds_eye_scene_regions(reference_asset_id);
create index if not exists idx_birds_eye_scene_regions_map_piece on public.historical_map_birds_eye_scene_regions(linked_map_piece_id);
create index if not exists idx_birds_eye_scene_regions_source on public.historical_map_birds_eye_scene_regions(linked_source_record_id);
create index if not exists idx_birds_eye_scene_regions_archived on public.historical_map_birds_eye_scene_regions(archived_at);
create index if not exists idx_birds_eye_scene_regions_type on public.historical_map_birds_eye_scene_regions(region_type);
create index if not exists idx_birds_eye_scene_regions_review on public.historical_map_birds_eye_scene_regions(review_status);
create index if not exists idx_birds_eye_scene_regions_scope
on public.historical_map_birds_eye_scene_regions(town_package_id, atlas_id, reference_asset_id, archived_at);

create table if not exists public.historical_map_birds_eye_piece_presentations (
  id uuid primary key default gen_random_uuid(),
  presentation_id text not null unique,
  town_package_id uuid not null references public.town_packages(id) on delete cascade,
  atlas_id text not null,
  reference_asset_id text not null,
  map_piece_id text not null references public.sanborn_map_pieces(piece_id) on delete cascade,
  source_geographic_geometry_checksum text,
  projected_image_geometry jsonb not null check (public.birds_eye_normalized_image_geometry_is_valid(projected_image_geometry, false)),
  adjusted_image_geometry jsonb check (adjusted_image_geometry is null or public.birds_eye_normalized_image_geometry_is_valid(adjusted_image_geometry, false)),
  adjustment_status text not null default 'projected' check (adjustment_status in ('projected', 'adjusted', 'stale', 'hidden', 'reviewed')),
  display_label text,
  opacity numeric not null default 0.55 check (opacity >= 0 and opacity <= 1),
  is_visible boolean not null default true,
  is_locked boolean not null default false,
  notes text,
  review_status review_status_enum not null default 'unknown',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint birds_eye_piece_presentation_edition_scope
    foreign key (town_package_id, atlas_id)
    references public.sanborn_atlases(town_package_id, atlas_id)
    on delete cascade,
  constraint birds_eye_piece_presentation_reference_scope
    foreign key (town_package_id, reference_asset_id)
    references public.historical_map_birds_eye_reference_assets(town_package_id, asset_id)
    on delete restrict,
  unique (town_package_id, atlas_id, reference_asset_id, map_piece_id)
);

create index if not exists idx_birds_eye_piece_presentations_town on public.historical_map_birds_eye_piece_presentations(town_package_id);
create index if not exists idx_birds_eye_piece_presentations_atlas on public.historical_map_birds_eye_piece_presentations(atlas_id);
create index if not exists idx_birds_eye_piece_presentations_reference on public.historical_map_birds_eye_piece_presentations(reference_asset_id);
create index if not exists idx_birds_eye_piece_presentations_piece on public.historical_map_birds_eye_piece_presentations(map_piece_id);
create index if not exists idx_birds_eye_piece_presentations_archived on public.historical_map_birds_eye_piece_presentations(archived_at);
create index if not exists idx_birds_eye_piece_presentations_review on public.historical_map_birds_eye_piece_presentations(review_status);

drop trigger if exists set_birds_eye_scene_regions_updated_at on public.historical_map_birds_eye_scene_regions;
create trigger set_birds_eye_scene_regions_updated_at
before update on public.historical_map_birds_eye_scene_regions
for each row execute function public.set_updated_at();

drop trigger if exists set_birds_eye_piece_presentations_updated_at on public.historical_map_birds_eye_piece_presentations;
create trigger set_birds_eye_piece_presentations_updated_at
before update on public.historical_map_birds_eye_piece_presentations
for each row execute function public.set_updated_at();

alter table public.historical_map_birds_eye_scene_regions enable row level security;
alter table public.historical_map_birds_eye_piece_presentations enable row level security;

revoke all on table public.historical_map_birds_eye_scene_regions from PUBLIC, anon, authenticated;
revoke all on table public.historical_map_birds_eye_piece_presentations from PUBLIC, anon, authenticated;
grant select, insert, update, delete on table public.historical_map_birds_eye_scene_regions to service_role;
grant select, insert, update, delete on table public.historical_map_birds_eye_piece_presentations to service_role;

-- Replace the PR #101 save function in-place. Existing calibration and
-- control-point rows remain; sequence upserts preserve their UUIDs.
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
  designated_reference_row uuid;
  calibration_row uuid;
  reference_asset_row uuid;
  point jsonb;
  point_ids jsonb;
begin
  select id, birds_eye_reference_asset_id into atlas_row, designated_reference_row
  from public.sanborn_atlases
  where atlas_id = p_atlas_id
    and town_package_id = p_town_package_id
    and archived_at is null;
  if atlas_row is null then raise exception 'Active Sanborn edition was not found for this town.'; end if;
  if jsonb_typeof(p_calibration) <> 'object' or jsonb_typeof(p_control_points) <> 'array' then raise exception 'Birds-Eye calibration payload is invalid.'; end if;
  if coalesce(p_calibration ->> 'status', 'draft') = 'unavailable'
    and nullif(trim(p_calibration ->> 'unavailableReason'), '') is null then
    raise exception 'Unavailable Birds-Eye calibration requires a reason.';
  end if;
  if jsonb_array_length(p_control_points) > 450 then raise exception 'Birds-Eye calibration supports at most 450 control points.'; end if;
  if nullif(p_calibration ->> 'referenceAssetId', '') is not null then
    select id into reference_asset_row
    from public.historical_map_birds_eye_reference_assets
    where asset_id = p_calibration ->> 'referenceAssetId'
      and town_package_id = p_town_package_id;
    if reference_asset_row is null then raise exception 'Birds-Eye reference asset is not owned by this town.'; end if;
    if reference_asset_row is distinct from designated_reference_row then
      raise exception 'Birds-Eye calibration reference must be the reference designated for this edition.';
    end if;
  end if;

  insert into public.historical_map_birds_eye_calibrations (
    town_package_id, atlas_id, reference_asset_id, title, calibration_status,
    unavailable_reason, global_parameters, warp_type, solver_version,
    warp_model, quality_summary, notes, updated_by
  )
  values (
    p_town_package_id, atlas_row, reference_asset_row,
    coalesce(nullif(p_calibration ->> 'title', ''), 'Birds-Eye Perspective Calibration'),
    coalesce(nullif(p_calibration ->> 'status', ''), 'draft'),
    nullif(p_calibration ->> 'unavailableReason', ''),
    coalesce(p_calibration -> 'globalParameters', '{}'::jsonb),
    coalesce(nullif(p_calibration ->> 'warpType', ''), 'delaunay_piecewise_affine'),
    coalesce(nullif(p_calibration ->> 'solverVersion', ''), 'birds-eye-v2'),
    coalesce(p_calibration -> 'warpModel', '{}'::jsonb),
    coalesce(p_calibration -> 'qualitySummary', '{}'::jsonb),
    p_calibration ->> 'notes',
    p_calibration ->> 'updatedBy'
  )
  on conflict (atlas_id) do update set
    reference_asset_id = excluded.reference_asset_id,
    title = excluded.title,
    calibration_status = excluded.calibration_status,
    unavailable_reason = excluded.unavailable_reason,
    global_parameters = excluded.global_parameters,
    warp_type = excluded.warp_type,
    solver_version = excluded.solver_version,
    warp_model = excluded.warp_model,
    quality_summary = excluded.quality_summary,
    notes = excluded.notes,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning id into calibration_row;

  update public.historical_map_birds_eye_control_points
  set deleted_at = now(), updated_at = now()
  where calibration_id = calibration_row and deleted_at is null;

  for point in select value from jsonb_array_elements(p_control_points) loop
    if coalesce((point ->> 'sequence')::integer, 0) < 1 then raise exception 'Control-point sequence must be a positive integer.'; end if;
    if nullif(point ->> 'longitude', '') is not null and ((point ->> 'longitude')::double precision < -180 or (point ->> 'longitude')::double precision > 180) then raise exception 'Control-point longitude is outside the valid range.'; end if;
    if nullif(point ->> 'latitude', '') is not null and ((point ->> 'latitude')::double precision < -90 or (point ->> 'latitude')::double precision > 90) then raise exception 'Control-point latitude is outside the valid range.'; end if;
    if nullif(trim(point ->> 'linkedMapPieceId'), '') is not null and not exists (
      select 1
      from public.sanborn_map_pieces piece
      join public.sanborn_atlas_pages page on page.id = piece.atlas_page_id
      where piece.piece_id = nullif(trim(point ->> 'linkedMapPieceId'), '')
        and page.atlas_id = atlas_row
        and page.archived_at is null
    ) then raise exception 'Linked control-point Map Piece must belong to the selected edition.'; end if;
    insert into public.historical_map_birds_eye_control_points (
      calibration_id, sequence_number, label, note, anchor_type,
      linked_map_piece_id, longitude, latitude, image_x, image_y,
      source_map_zoom, source_map_bearing, source_map_label,
      historical_image_note, geographic_note, enabled, deleted_at
    )
    values (
      calibration_row,
      (point ->> 'sequence')::integer,
      point ->> 'label',
      point ->> 'note',
      coalesce(nullif(point ->> 'anchorType', ''), 'other'),
      nullif(point ->> 'linkedMapPieceId', ''),
      nullif(point ->> 'longitude', '')::double precision,
      nullif(point ->> 'latitude', '')::double precision,
      nullif(point ->> 'imageX', '')::double precision,
      nullif(point ->> 'imageY', '')::double precision,
      nullif(point ->> 'sourceMapZoom', '')::double precision,
      nullif(point ->> 'sourceMapBearing', '')::double precision,
      nullif(point ->> 'sourceMapLabel', ''),
      nullif(point ->> 'historicalImageNote', ''),
      nullif(point ->> 'geographicNote', ''),
      coalesce((point ->> 'enabled')::boolean, true),
      null
    )
    on conflict (calibration_id, sequence_number) do update set
      label = excluded.label,
      note = excluded.note,
      anchor_type = excluded.anchor_type,
      linked_map_piece_id = excluded.linked_map_piece_id,
      longitude = excluded.longitude,
      latitude = excluded.latitude,
      image_x = excluded.image_x,
      image_y = excluded.image_y,
      source_map_zoom = excluded.source_map_zoom,
      source_map_bearing = excluded.source_map_bearing,
      source_map_label = excluded.source_map_label,
      historical_image_note = excluded.historical_image_note,
      geographic_note = excluded.geographic_note,
      enabled = excluded.enabled,
      deleted_at = null,
      updated_at = now();
  end loop;

  insert into public.review_events (
    town_package_id, target_table, target_id, action_type,
    next_review_status, certainty, is_verified, summary, review_note
  )
  values (
    p_town_package_id,
    'historical_map_birds_eye_calibrations',
    calibration_row::text,
    'calibration_saved',
    'unknown',
    'unknown',
    false,
    'Birds-Eye calibration and control-point pairs saved.',
    nullif(p_calibration ->> 'notes', '')
  );

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'sequence', sequence_number) order by sequence_number), '[]'::jsonb)
  into point_ids
  from public.historical_map_birds_eye_control_points
  where calibration_id = calibration_row and deleted_at is null;

  return jsonb_build_object('ok', true, 'calibrationId', calibration_row, 'pointIds', point_ids);
end;
$$;

create or replace function public.save_historical_map_birds_eye_scene_region(
  p_town_package_id uuid,
  p_atlas_id text,
  p_reference_asset_id text,
  p_region jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  atlas_row uuid;
  designated_reference_row uuid;
  reference_row uuid;
  existing public.historical_map_birds_eye_scene_regions%rowtype;
  saved public.historical_map_birds_eye_scene_regions%rowtype;
  region_identifier text;
  linked_piece text;
  linked_source uuid;
  linked_building text;
  previous_status review_status_enum;
  next_status review_status_enum;
begin
  select id, birds_eye_reference_asset_id into atlas_row, designated_reference_row from public.sanborn_atlases
  where atlas_id = p_atlas_id and town_package_id = p_town_package_id and archived_at is null;
  if atlas_row is null then raise exception 'Active Sanborn edition was not found for this town.'; end if;
  select id into reference_row from public.historical_map_birds_eye_reference_assets
  where asset_id = p_reference_asset_id and town_package_id = p_town_package_id;
  if reference_row is null then raise exception 'Birds-Eye reference asset is not owned by this town.'; end if;
  if reference_row is distinct from designated_reference_row then
    raise exception 'Scene-region reference must be the reference designated for this edition.';
  end if;
  if jsonb_typeof(p_region) <> 'object' then raise exception 'Scene-region payload is invalid.'; end if;
  if not public.birds_eye_normalized_image_geometry_is_valid(p_region -> 'imageGeometry', true) then raise exception 'Scene-region image geometry is invalid.'; end if;
  if not public.birds_eye_normalized_crop_bounds_is_valid(p_region -> 'cropBounds') then raise exception 'Scene-region crop bounds are invalid.'; end if;
  region_identifier := nullif(trim(p_region ->> 'regionId'), '');
  if region_identifier is null then raise exception 'Scene-region ID is required.'; end if;
  if coalesce(p_region ->> 'regionType', 'unknown') not in (
    'building', 'building_group', 'block', 'street', 'railroad', 'depot',
    'industrial_site', 'bridge', 'waterway', 'vegetation', 'open_land',
    'landmark', 'skyline', 'background', 'unknown'
  ) then raise exception 'Scene-region type is not allowed.'; end if;
  if nullif(trim(p_region ->> 'label'), '') is null then raise exception 'Scene-region label is required.'; end if;
  if nullif(p_region ->> 'confidence', '') is not null
    and ((p_region ->> 'confidence')::numeric < 0 or (p_region ->> 'confidence')::numeric > 1) then
    raise exception 'Scene-region confidence must be between 0 and 1.';
  end if;

  linked_piece := nullif(trim(p_region ->> 'linkedMapPieceId'), '');
  linked_source := nullif(trim(p_region ->> 'linkedSourceRecordId'), '')::uuid;
  linked_building := nullif(trim(p_region ->> 'linkedBuildingId'), '');
  if linked_piece is not null and not exists (
    select 1
    from public.sanborn_map_pieces piece
    join public.sanborn_atlas_pages page on page.id = piece.atlas_page_id
    where piece.piece_id = linked_piece and page.atlas_id = atlas_row and page.archived_at is null
  ) then raise exception 'Linked Map Piece must belong to the selected edition.'; end if;
  if linked_source is not null and not exists (
    select 1 from public.source_records where id = linked_source and town_package_id = p_town_package_id
  ) then raise exception 'Linked source record must belong to the selected town.'; end if;
  if linked_building is not null and not exists (
    select 1 from public.buildings where building_id = linked_building and town_package_id = p_town_package_id
  ) then raise exception 'Linked building must belong to the selected town.'; end if;

  select * into existing
  from public.historical_map_birds_eye_scene_regions
  where region_id = region_identifier;
  if existing.id is not null and (
    existing.town_package_id <> p_town_package_id
    or existing.atlas_id <> p_atlas_id
    or existing.reference_asset_id <> p_reference_asset_id
  ) then raise exception 'Scene-region ID belongs to another town, edition, or reference asset.'; end if;
  if existing.id is not null and existing.archived_at is not null then
    raise exception 'Archived scene regions are read-only and cannot be restored by an ordinary save.';
  end if;
  previous_status := existing.review_status;
  next_status := coalesce(nullif(p_region ->> 'reviewStatus', ''), 'unknown')::review_status_enum;

  if existing.id is null then
    insert into public.historical_map_birds_eye_scene_regions (
      region_id, town_package_id, atlas_id, reference_asset_id, region_type,
      label, description, image_geometry, linked_map_piece_id,
      linked_source_record_id, linked_building_id, evidence_classification,
      review_status, confidence, visible_features, reconstruction_notes,
      rendering_notes, crop_bounds, is_visible, is_locked, sort_order
    )
    values (
      region_identifier, p_town_package_id, p_atlas_id, p_reference_asset_id,
      coalesce(nullif(p_region ->> 'regionType', ''), 'unknown'),
      trim(p_region ->> 'label'), nullif(p_region ->> 'description', ''),
      p_region -> 'imageGeometry', linked_piece, linked_source, linked_building,
      coalesce(nullif(p_region ->> 'evidenceClassification', ''), 'unknown')::review_status_enum,
      next_status, nullif(p_region ->> 'confidence', '')::numeric,
      coalesce(p_region -> 'visibleFeatures', '{}'::jsonb),
      nullif(p_region ->> 'reconstructionNotes', ''),
      nullif(p_region ->> 'renderingNotes', ''),
      p_region -> 'cropBounds',
      coalesce((p_region ->> 'isVisible')::boolean, true),
      coalesce((p_region ->> 'isLocked')::boolean, false),
      coalesce((p_region ->> 'sortOrder')::integer, 0)
    )
    returning * into saved;
  else
    update public.historical_map_birds_eye_scene_regions set
      region_type = coalesce(nullif(p_region ->> 'regionType', ''), 'unknown'),
      label = trim(p_region ->> 'label'),
      description = nullif(p_region ->> 'description', ''),
      image_geometry = p_region -> 'imageGeometry',
      linked_map_piece_id = linked_piece,
      linked_source_record_id = linked_source,
      linked_building_id = linked_building,
      evidence_classification = coalesce(nullif(p_region ->> 'evidenceClassification', ''), 'unknown')::review_status_enum,
      review_status = next_status,
      confidence = nullif(p_region ->> 'confidence', '')::numeric,
      visible_features = coalesce(p_region -> 'visibleFeatures', '{}'::jsonb),
      reconstruction_notes = nullif(p_region ->> 'reconstructionNotes', ''),
      rendering_notes = nullif(p_region ->> 'renderingNotes', ''),
      crop_bounds = p_region -> 'cropBounds',
      is_visible = coalesce((p_region ->> 'isVisible')::boolean, true),
      is_locked = coalesce((p_region ->> 'isLocked')::boolean, false),
      sort_order = coalesce((p_region ->> 'sortOrder')::integer, 0),
      updated_at = now()
    where id = existing.id
    returning * into saved;
  end if;

  insert into public.review_events (
    town_package_id, target_table, target_id, source_record_id, action_type,
    previous_review_status, next_review_status, certainty, is_verified, summary, review_note
  )
  values (
    p_town_package_id, 'historical_map_birds_eye_scene_regions', saved.region_id,
    saved.linked_source_record_id, case when existing.id is null then 'scene_region_created' else 'scene_region_updated' end,
    previous_status, next_status,
    case when saved.confidence is null then 'unknown'::certainty_enum
      when saved.confidence >= 0.8 then 'high'::certainty_enum
      when saved.confidence >= 0.5 then 'medium'::certainty_enum
      else 'low'::certainty_enum end,
    false, 'Birds-Eye scene region saved.', saved.reconstruction_notes
  );
  return to_jsonb(saved);
end;
$$;

create or replace function public.archive_historical_map_birds_eye_scene_region(
  p_town_package_id uuid,
  p_atlas_id text,
  p_reference_asset_id text,
  p_region_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  archived public.historical_map_birds_eye_scene_regions%rowtype;
begin
  if not exists (
    select 1
    from public.sanborn_atlases
    where atlas_id = p_atlas_id
      and town_package_id = p_town_package_id
      and archived_at is null
  ) then raise exception 'Archived or missing Sanborn editions are read-only.'; end if;
  update public.historical_map_birds_eye_scene_regions
  set archived_at = now(), is_visible = false, updated_at = now()
  where region_id = p_region_id
    and town_package_id = p_town_package_id
    and atlas_id = p_atlas_id
    and reference_asset_id = p_reference_asset_id
    and archived_at is null
  returning * into archived;
  if archived.id is null then raise exception 'Active scene region was not found in the selected scope.'; end if;
  insert into public.review_events (
    town_package_id, target_table, target_id, source_record_id, action_type,
    previous_review_status, next_review_status, certainty, is_verified, summary
  )
  values (
    p_town_package_id, 'historical_map_birds_eye_scene_regions', archived.region_id,
    archived.linked_source_record_id, 'scene_region_archived',
    archived.review_status, archived.review_status, 'unknown', false,
    'Birds-Eye scene region archived without erasing review history.'
  );
  return jsonb_build_object('ok', true, 'regionId', archived.region_id, 'archivedAt', archived.archived_at);
end;
$$;

create or replace function public.save_historical_map_birds_eye_piece_presentation(
  p_town_package_id uuid,
  p_atlas_id text,
  p_reference_asset_id text,
  p_presentation jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  atlas_row uuid;
  designated_reference_row uuid;
  reference_row uuid;
  existing public.historical_map_birds_eye_piece_presentations%rowtype;
  saved public.historical_map_birds_eye_piece_presentations%rowtype;
  presentation_identifier text;
  piece_identifier text;
  previous_status review_status_enum;
  next_status review_status_enum;
begin
  select id, birds_eye_reference_asset_id into atlas_row, designated_reference_row from public.sanborn_atlases
  where atlas_id = p_atlas_id and town_package_id = p_town_package_id and archived_at is null;
  if atlas_row is null then raise exception 'Active Sanborn edition was not found for this town.'; end if;
  select id into reference_row from public.historical_map_birds_eye_reference_assets
  where asset_id = p_reference_asset_id and town_package_id = p_town_package_id;
  if reference_row is null then raise exception 'Birds-Eye reference asset is not owned by this town.'; end if;
  if reference_row is distinct from designated_reference_row then
    raise exception 'Piece-presentation reference must be the reference designated for this edition.';
  end if;
  if jsonb_typeof(p_presentation) <> 'object' then raise exception 'Piece-presentation payload is invalid.'; end if;
  if not public.birds_eye_normalized_image_geometry_is_valid(p_presentation -> 'projectedImageGeometry', false) then raise exception 'Projected image geometry is invalid.'; end if;
  if p_presentation -> 'adjustedImageGeometry' is not null
    and p_presentation -> 'adjustedImageGeometry' <> 'null'::jsonb
    and not public.birds_eye_normalized_image_geometry_is_valid(p_presentation -> 'adjustedImageGeometry', false) then
    raise exception 'Adjusted image geometry is invalid.';
  end if;
  presentation_identifier := nullif(trim(p_presentation ->> 'presentationId'), '');
  piece_identifier := nullif(trim(p_presentation ->> 'mapPieceId'), '');
  if presentation_identifier is null or piece_identifier is null then raise exception 'Presentation and Map Piece IDs are required.'; end if;
  if coalesce(p_presentation ->> 'adjustmentStatus', 'projected') not in ('projected', 'adjusted', 'stale', 'hidden', 'reviewed') then raise exception 'Presentation status is not allowed.'; end if;
  if not exists (
    select 1 from public.sanborn_map_pieces piece
    join public.sanborn_atlas_pages page on page.id = piece.atlas_page_id
    where piece.piece_id = piece_identifier and page.atlas_id = atlas_row and page.archived_at is null
  ) then raise exception 'Map Piece must belong to the selected edition.'; end if;

  if exists (
    select 1
    from public.historical_map_birds_eye_piece_presentations candidate
    where candidate.presentation_id = presentation_identifier
      and (
        candidate.town_package_id <> p_town_package_id
        or candidate.atlas_id <> p_atlas_id
        or candidate.reference_asset_id <> p_reference_asset_id
        or candidate.map_piece_id <> piece_identifier
      )
  ) then raise exception 'Piece-presentation ID belongs to another town, edition, reference, or Map Piece.'; end if;
  select * into existing
  from public.historical_map_birds_eye_piece_presentations
  where town_package_id = p_town_package_id
    and atlas_id = p_atlas_id
    and reference_asset_id = p_reference_asset_id
    and map_piece_id = piece_identifier;
  if existing.id is not null and existing.archived_at is not null then
    raise exception 'Archived piece presentations are read-only and cannot be restored by an ordinary save.';
  end if;
  previous_status := existing.review_status;
  next_status := coalesce(nullif(p_presentation ->> 'reviewStatus', ''), 'unknown')::review_status_enum;

  insert into public.historical_map_birds_eye_piece_presentations (
    presentation_id, town_package_id, atlas_id, reference_asset_id,
    map_piece_id, source_geographic_geometry_checksum,
    projected_image_geometry, adjusted_image_geometry, adjustment_status,
    display_label, opacity, is_visible, is_locked, notes, review_status
  )
  values (
    presentation_identifier, p_town_package_id, p_atlas_id, p_reference_asset_id,
    piece_identifier, nullif(p_presentation ->> 'sourceGeographicGeometryChecksum', ''),
    p_presentation -> 'projectedImageGeometry',
    case when p_presentation -> 'adjustedImageGeometry' = 'null'::jsonb then null else p_presentation -> 'adjustedImageGeometry' end,
    coalesce(nullif(p_presentation ->> 'adjustmentStatus', ''), 'projected'),
    nullif(p_presentation ->> 'displayLabel', ''),
    coalesce((p_presentation ->> 'opacity')::numeric, 0.55),
    coalesce((p_presentation ->> 'isVisible')::boolean, true),
    coalesce((p_presentation ->> 'isLocked')::boolean, false),
    nullif(p_presentation ->> 'notes', ''),
    next_status
  )
  on conflict (town_package_id, atlas_id, reference_asset_id, map_piece_id) do update set
    source_geographic_geometry_checksum = excluded.source_geographic_geometry_checksum,
    projected_image_geometry = excluded.projected_image_geometry,
    adjusted_image_geometry = excluded.adjusted_image_geometry,
    adjustment_status = excluded.adjustment_status,
    display_label = excluded.display_label,
    opacity = excluded.opacity,
    is_visible = excluded.is_visible,
    is_locked = excluded.is_locked,
    notes = excluded.notes,
    review_status = excluded.review_status,
    updated_at = now()
  returning * into saved;

  insert into public.review_events (
    town_package_id, target_table, target_id, action_type,
    previous_review_status, next_review_status, certainty, is_verified, summary, review_note
  )
  values (
    p_town_package_id, 'historical_map_birds_eye_piece_presentations', saved.presentation_id,
    case
      when saved.adjustment_status = 'stale' then 'piece_presentation_marked_stale'
      when saved.adjusted_image_geometry is null then 'piece_presentation_projected'
      else 'piece_presentation_adjusted'
    end,
    previous_status, next_status, 'unknown', false,
    'Birds-Eye presentation geometry saved separately from authoritative Map Placement.',
    saved.notes
  );
  return to_jsonb(saved);
end;
$$;

create or replace function public.save_historical_map_birds_eye_piece_presentations(
  p_town_package_id uuid,
  p_atlas_id text,
  p_reference_asset_id text,
  p_presentations jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  presentation jsonb;
  saved jsonb;
  saved_rows jsonb := '[]'::jsonb;
  piece_ids text[];
begin
  if jsonb_typeof(p_presentations) is distinct from 'array' then
    raise exception 'Piece-presentation collection must be an array.';
  end if;
  if jsonb_array_length(p_presentations) < 1 or jsonb_array_length(p_presentations) > 1000 then
    raise exception 'Piece-presentation collection must contain between 1 and 1000 records.';
  end if;
  select array_agg(value ->> 'mapPieceId')
  into piece_ids
  from jsonb_array_elements(p_presentations);
  if cardinality(piece_ids) <> cardinality(array(select distinct unnest(piece_ids))) then
    raise exception 'Piece-presentation collection contains duplicate Map Piece IDs.';
  end if;

  for presentation in select value from jsonb_array_elements(p_presentations) loop
    saved := public.save_historical_map_birds_eye_piece_presentation(
      p_town_package_id,
      p_atlas_id,
      p_reference_asset_id,
      presentation
    );
    saved_rows := saved_rows || jsonb_build_array(saved);
  end loop;
  return jsonb_build_object('ok', true, 'presentations', saved_rows);
end;
$$;

revoke execute on function public.birds_eye_normalized_image_geometry_is_valid(jsonb, boolean) from PUBLIC, anon, authenticated;
revoke execute on function public.birds_eye_normalized_crop_bounds_is_valid(jsonb) from PUBLIC, anon, authenticated;
revoke execute on function public.save_historical_map_birds_eye_calibration(uuid, text, jsonb, jsonb) from PUBLIC, anon, authenticated;
revoke execute on function public.save_historical_map_birds_eye_scene_region(uuid, text, text, jsonb) from PUBLIC, anon, authenticated;
revoke execute on function public.archive_historical_map_birds_eye_scene_region(uuid, text, text, text) from PUBLIC, anon, authenticated;
revoke execute on function public.save_historical_map_birds_eye_piece_presentation(uuid, text, text, jsonb) from PUBLIC, anon, authenticated;
revoke execute on function public.save_historical_map_birds_eye_piece_presentations(uuid, text, text, jsonb) from PUBLIC, anon, authenticated;

grant execute on function public.birds_eye_normalized_image_geometry_is_valid(jsonb, boolean) to service_role;
grant execute on function public.birds_eye_normalized_crop_bounds_is_valid(jsonb) to service_role;
grant execute on function public.save_historical_map_birds_eye_calibration(uuid, text, jsonb, jsonb) to service_role;
grant execute on function public.save_historical_map_birds_eye_scene_region(uuid, text, text, jsonb) to service_role;
grant execute on function public.archive_historical_map_birds_eye_scene_region(uuid, text, text, text) to service_role;
grant execute on function public.save_historical_map_birds_eye_piece_presentation(uuid, text, text, jsonb) to service_role;
grant execute on function public.save_historical_map_birds_eye_piece_presentations(uuid, text, text, jsonb) to service_role;
