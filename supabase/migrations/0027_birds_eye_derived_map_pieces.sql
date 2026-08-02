-- PR #111: Birds-Eye scene regions can produce approximate Map Pieces.
-- Additive only. These records are deliberately separate from Sanborn Map
-- Pieces and never replace or mutate Sanborn source geometry.

create or replace function public.birds_eye_derived_geographic_geometry_is_valid(p_geometry jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  point jsonb;
  point_count integer;
  geometry_type text;
begin
  if p_geometry is null or jsonb_typeof(p_geometry) <> 'object' then return false; end if;
  geometry_type := p_geometry ->> 'geometryType';
  if geometry_type not in ('polygon', 'polyline', 'point') then return false; end if;
  if jsonb_typeof(p_geometry -> 'coordinates') <> 'array' then return false; end if;
  point_count := jsonb_array_length(p_geometry -> 'coordinates');
  if (geometry_type = 'polygon' and point_count < 3)
    or (geometry_type = 'polyline' and point_count < 2)
    or (geometry_type = 'point' and point_count < 1) then return false; end if;
  for point in select value from jsonb_array_elements(p_geometry -> 'coordinates') loop
    if jsonb_typeof(point) <> 'object'
      or jsonb_typeof(point -> 'latitude') <> 'number'
      or jsonb_typeof(point -> 'longitude') <> 'number'
      or ((point ->> 'latitude')::double precision not between -90 and 90)
      or ((point ->> 'longitude')::double precision not between -180 and 180) then
      return false;
    end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;

create table if not exists public.historical_map_birds_eye_derived_map_pieces (
  id uuid primary key default gen_random_uuid(),
  derived_piece_id text not null unique,
  town_package_id uuid not null references public.town_packages(id) on delete cascade,
  atlas_id text not null,
  source_region_id text not null references public.historical_map_birds_eye_scene_regions(region_id) on delete restrict,
  reference_asset_id text not null,
  source_filename text not null,
  label text not null check (length(trim(label)) > 0),
  region_type text not null,
  placement_type text not null default 'unknown',
  source_classification text not null default 'birds_eye_derived' check (source_classification = 'birds_eye_derived'),
  placement_precision text not null default 'approximate' check (placement_precision in ('exact', 'approximate', 'broad_area', 'uncertain')),
  source_image_geometry jsonb not null check (public.birds_eye_normalized_image_geometry_is_valid(source_image_geometry, true)),
  crop_bounds jsonb check (public.birds_eye_normalized_crop_bounds_is_valid(crop_bounds)),
  provenance_note text not null,
  source_notes text,
  evidence_classification review_status_enum not null default 'unknown',
  review_status review_status_enum not null default 'unknown',
  confidence numeric check (confidence is null or (confidence between 0 and 1)),
  creation_status text not null default 'created' check (creation_status in ('created', 'ready_for_placement', 'placed', 'archived')),
  geographic_geometry jsonb check (geographic_geometry is null or public.birds_eye_derived_geographic_geometry_is_valid(geographic_geometry)),
  center_latitude double precision check (center_latitude is null or center_latitude between -90 and 90),
  center_longitude double precision check (center_longitude is null or center_longitude between -180 and 180),
  rotation double precision not null default 0,
  scale_x double precision not null default 1 check (scale_x > 0),
  scale_y double precision not null default 1 check (scale_y > 0),
  opacity double precision not null default 0.72 check (opacity between 0 and 1),
  is_visible boolean not null default true,
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint birds_eye_derived_piece_edition_scope foreign key (town_package_id, atlas_id)
    references public.sanborn_atlases(town_package_id, atlas_id) on delete cascade,
  constraint birds_eye_derived_piece_reference_scope foreign key (town_package_id, reference_asset_id)
    references public.historical_map_birds_eye_reference_assets(town_package_id, asset_id) on delete restrict
);

create unique index if not exists idx_birds_eye_derived_piece_active_region
on public.historical_map_birds_eye_derived_map_pieces(town_package_id, atlas_id, source_region_id)
where archived_at is null;
create index if not exists idx_birds_eye_derived_piece_town on public.historical_map_birds_eye_derived_map_pieces(town_package_id);
create index if not exists idx_birds_eye_derived_piece_atlas on public.historical_map_birds_eye_derived_map_pieces(atlas_id);
create index if not exists idx_birds_eye_derived_piece_region on public.historical_map_birds_eye_derived_map_pieces(source_region_id);
create index if not exists idx_birds_eye_derived_piece_reference on public.historical_map_birds_eye_derived_map_pieces(reference_asset_id);
create index if not exists idx_birds_eye_derived_piece_archived on public.historical_map_birds_eye_derived_map_pieces(archived_at);

drop trigger if exists set_birds_eye_derived_map_pieces_updated_at on public.historical_map_birds_eye_derived_map_pieces;
create trigger set_birds_eye_derived_map_pieces_updated_at
before update on public.historical_map_birds_eye_derived_map_pieces
for each row execute function public.set_updated_at();

alter table public.historical_map_birds_eye_derived_map_pieces enable row level security;
revoke all on table public.historical_map_birds_eye_derived_map_pieces from PUBLIC, anon, authenticated;
grant select, insert, update, delete on table public.historical_map_birds_eye_derived_map_pieces to service_role;

create or replace function public.create_birds_eye_derived_map_piece(
  p_town_package_id uuid,
  p_atlas_id text,
  p_reference_asset_id text,
  p_region_id text,
  p_piece jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  region_row public.historical_map_birds_eye_scene_regions%rowtype;
  existing_row public.historical_map_birds_eye_derived_map_pieces%rowtype;
  new_row public.historical_map_birds_eye_derived_map_pieces%rowtype;
begin
  select * into region_row from public.historical_map_birds_eye_scene_regions
  where region_id = p_region_id and town_package_id = p_town_package_id
    and atlas_id = p_atlas_id and reference_asset_id = p_reference_asset_id;
  if not found then raise exception 'The Birds-Eye scene region is outside the requested scope.'; end if;
  if region_row.archived_at is not null then raise exception 'Archived scene regions cannot create new derived Map Pieces.'; end if;
  select * into existing_row from public.historical_map_birds_eye_derived_map_pieces
  where town_package_id = p_town_package_id and atlas_id = p_atlas_id
    and source_region_id = p_region_id and archived_at is null;
  if found then
    return jsonb_build_object('ok', true, 'duplicate', true, 'derivedPiece', to_jsonb(existing_row));
  end if;
  insert into public.historical_map_birds_eye_derived_map_pieces (
    derived_piece_id, town_package_id, atlas_id, source_region_id, reference_asset_id,
    source_filename, label, region_type, placement_type, placement_precision,
    source_image_geometry, crop_bounds, provenance_note, source_notes,
    evidence_classification, review_status, confidence, creation_status
  ) values (
    coalesce(nullif(trim(p_piece ->> 'derivedPieceId'), ''), 'birds-eye-derived-' || gen_random_uuid()::text),
    p_town_package_id, p_atlas_id, p_region_id, p_reference_asset_id,
    coalesce(nullif(trim(p_piece ->> 'sourceFilename'), ''), 'Historical Birds-Eye reference'),
    coalesce(nullif(trim(p_piece ->> 'label'), ''), region_row.label),
    coalesce(nullif(trim(p_piece ->> 'regionType'), ''), region_row.region_type),
    coalesce(nullif(trim(p_piece ->> 'placementType'), ''), 'unknown'),
    coalesce(nullif(trim(p_piece ->> 'placementPrecision'), ''), 'approximate'),
    region_row.image_geometry, region_row.crop_bounds,
    coalesce(nullif(trim(p_piece ->> 'provenanceNote'), ''), 'Derived from a Birds-Eye perspective illustration; approximate placement only.'),
    p_piece ->> 'sourceNotes', coalesce(nullif(trim(p_piece ->> 'evidenceClassification'), ''), 'unknown'),
    region_row.review_status, region_row.confidence, 'ready_for_placement'
  ) returning * into new_row;
  insert into public.review_events (town_package_id, target_table, target_id, action_type, next_review_status, certainty, is_verified, summary)
  values (p_town_package_id, 'historical_map_birds_eye_derived_map_pieces', new_row.id::text, 'derived_map_piece_created', new_row.review_status, 'unknown', false, 'Approximate Map Piece derived from a Birds-Eye scene region.');
  return jsonb_build_object('ok', true, 'duplicate', false, 'derivedPiece', to_jsonb(new_row));
end;
$$;

create or replace function public.save_birds_eye_derived_map_piece_placement(
  p_town_package_id uuid, p_atlas_id text, p_derived_piece_id text, p_placement jsonb
)
returns jsonb
language plpgsql security invoker set search_path = public
as $$
declare row_data public.historical_map_birds_eye_derived_map_pieces%rowtype;
begin
  update public.historical_map_birds_eye_derived_map_pieces
  set geographic_geometry = p_placement -> 'geographicGeometry',
      center_latitude = nullif(p_placement ->> 'centerLatitude', '')::double precision,
      center_longitude = nullif(p_placement ->> 'centerLongitude', '')::double precision,
      rotation = coalesce(nullif(p_placement ->> 'rotation', '')::double precision, rotation),
      scale_x = coalesce(nullif(p_placement ->> 'scaleX', '')::double precision, scale_x),
      scale_y = coalesce(nullif(p_placement ->> 'scaleY', '')::double precision, scale_y),
      opacity = coalesce(nullif(p_placement ->> 'opacity', '')::double precision, opacity),
      creation_status = 'placed'
  where town_package_id = p_town_package_id and atlas_id = p_atlas_id
    and derived_piece_id = p_derived_piece_id and archived_at is null
  returning * into row_data;
  if not found then raise exception 'Derived Map Piece was not found in the requested scope.'; end if;
  return jsonb_build_object('ok', true, 'derivedPiece', to_jsonb(row_data));
end;
$$;
