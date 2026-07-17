create table if not exists public.sanborn_map_piece_georeferences (
  id uuid primary key default gen_random_uuid(),
  piece_georeference_id text not null unique,
  town_package_id uuid not null references public.town_packages(id) on delete cascade,
  workspace_id uuid not null references public.historical_map_workspaces(id) on delete cascade,
  atlas_page_id uuid not null references public.sanborn_atlas_pages(id) on delete cascade,
  map_piece_id uuid not null references public.sanborn_map_pieces(id) on delete cascade,
  target_type text not null default 'sanborn_map_piece' check (target_type = 'sanborn_map_piece'),
  target_geometry text not null default 'polygon' check (target_geometry in ('polygon', 'line', 'point')),
  northwest_latitude double precision not null check (northwest_latitude between -90 and 90),
  northwest_longitude double precision not null check (northwest_longitude between -180 and 180),
  northeast_latitude double precision not null check (northeast_latitude between -90 and 90),
  northeast_longitude double precision not null check (northeast_longitude between -180 and 180),
  southeast_latitude double precision not null check (southeast_latitude between -90 and 90),
  southeast_longitude double precision not null check (southeast_longitude between -180 and 180),
  southwest_latitude double precision not null check (southwest_latitude between -90 and 90),
  southwest_longitude double precision not null check (southwest_longitude between -180 and 180),
  center_latitude double precision not null check (center_latitude between -90 and 90),
  center_longitude double precision not null check (center_longitude between -180 and 180),
  rotation double precision not null default 0,
  opacity double precision not null default 0.72 check (opacity >= 0 and opacity <= 1),
  layer_order integer not null default 0,
  placement_status text not null default 'unplaced' check (placement_status in ('unplaced', 'draft', 'placed', 'aligned', 'reviewed')),
  is_visible boolean not null default true,
  is_locked boolean not null default false,
  review_status review_status_enum not null default 'unknown',
  evidence_classification review_status_enum not null default 'unknown',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, map_piece_id)
);

create index if not exists idx_sanborn_map_piece_georeferences_workspace
on public.sanborn_map_piece_georeferences (workspace_id, layer_order);

create index if not exists idx_sanborn_map_piece_georeferences_town
on public.sanborn_map_piece_georeferences (town_package_id, placement_status);

create index if not exists idx_sanborn_map_piece_georeferences_page
on public.sanborn_map_piece_georeferences (atlas_page_id, layer_order);

create index if not exists idx_sanborn_map_piece_georeferences_piece
on public.sanborn_map_piece_georeferences (map_piece_id);

drop trigger if exists set_sanborn_map_piece_georeferences_updated_at on public.sanborn_map_piece_georeferences;
create trigger set_sanborn_map_piece_georeferences_updated_at
before update on public.sanborn_map_piece_georeferences
for each row
execute function public.set_updated_at();

create or replace function public.save_sanborn_map_piece_georeference(
  p_town_package_id uuid,
  p_workspace_id text,
  p_workspace_name text,
  p_map_year integer,
  p_map_center jsonb,
  p_map_zoom double precision,
  p_piece_id text,
  p_placement jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  town record;
  workspace record;
  piece record;
  existing_placement record;
  requested_georeference_id text;
  placement_row_id uuid;
  center_latitude double precision;
  center_longitude double precision;
  map_center_latitude double precision;
  map_center_longitude double precision;
  normalized_status text;
  normalized_opacity double precision;
  normalized_rotation double precision;
  normalized_layer_order integer;
  normalized_is_visible boolean;
  normalized_is_locked boolean;
begin
  if p_town_package_id is null or nullif(trim(p_workspace_id), '') is null or nullif(trim(p_piece_id), '') is null then
    raise exception 'Map piece placement saves require a town package, workspace ID, and map piece ID.';
  end if;

  if p_map_year is null or p_map_year <= 0 then
    raise exception 'Map piece placement saves require a valid map year.';
  end if;

  if p_placement is null or jsonb_typeof(p_placement) <> 'object' then
    raise exception 'Map piece placement payload must be an object.';
  end if;

  select id, package_id, name, year
  into town
  from public.town_packages
  where id = p_town_package_id;

  if not found then
    raise exception 'Town package was not found.';
  end if;

  select
    piece.id as map_piece_row_id,
    piece.piece_id,
    piece.atlas_page_id,
    page.page_id,
    atlas.town_package_id
  into piece
  from public.sanborn_map_pieces piece
  join public.sanborn_atlas_pages page on page.id = piece.atlas_page_id
  join public.sanborn_atlases atlas on atlas.id = page.atlas_id
  where piece.piece_id = p_piece_id;

  if not found then
    raise exception 'Sanborn map piece was not found.';
  end if;

  if piece.town_package_id <> p_town_package_id then
    raise exception 'Map piece belongs to another town package.';
  end if;

  begin
    map_center_latitude := nullif(p_map_center ->> 'latitude', '')::double precision;
    map_center_longitude := nullif(p_map_center ->> 'longitude', '')::double precision;
  exception when others then
    map_center_latitude := null;
    map_center_longitude := null;
  end;

  if map_center_latitude is not null and (map_center_latitude < -90 or map_center_latitude > 90) then
    raise exception 'Map center latitude is out of range.';
  end if;

  if map_center_longitude is not null and (map_center_longitude < -180 or map_center_longitude > 180) then
    raise exception 'Map center longitude is out of range.';
  end if;

  insert into public.historical_map_workspaces (
    workspace_id,
    town_package_id,
    map_year,
    name,
    selected_basemap,
    geographic_center_latitude,
    geographic_center_longitude,
    geographic_zoom,
    geographic_edit_mode,
    global_historical_opacity
  )
  values (
    left(trim(p_workspace_id), 120),
    p_town_package_id,
    p_map_year,
    coalesce(nullif(trim(p_workspace_name), ''), town.name || ' ' || p_map_year::text || ' Historical Map Studio'),
    'osm',
    map_center_latitude,
    map_center_longitude,
    coalesce(p_map_zoom, 16),
    'pan_modern_map',
    1
  )
  on conflict (town_package_id, map_year)
  do update set
    workspace_id = excluded.workspace_id,
    name = excluded.name,
    geographic_center_latitude = excluded.geographic_center_latitude,
    geographic_center_longitude = excluded.geographic_center_longitude,
    geographic_zoom = excluded.geographic_zoom
  returning id, workspace_id into workspace;

  begin
    center_latitude := (p_placement ->> 'centerLatitude')::double precision;
    center_longitude := (p_placement ->> 'centerLongitude')::double precision;
    normalized_rotation := coalesce(nullif(p_placement ->> 'rotation', '')::double precision, 0);
    normalized_opacity := coalesce(nullif(p_placement ->> 'opacity', '')::double precision, 0.72);
    normalized_layer_order := coalesce(nullif(p_placement ->> 'layerOrder', '')::integer, 0);
    normalized_is_visible := coalesce((p_placement ->> 'isVisible')::boolean, true);
    normalized_is_locked := coalesce((p_placement ->> 'isLocked')::boolean, false);
  exception when others then
    raise exception 'Map piece placement contains invalid numeric or boolean values.';
  end;

  if center_latitude < -90 or center_latitude > 90 or center_longitude < -180 or center_longitude > 180 then
    raise exception 'Map piece placement center is out of range.';
  end if;

  if normalized_opacity < 0 or normalized_opacity > 1 then
    raise exception 'Map piece placement opacity is out of range.';
  end if;

  normalized_status := coalesce(nullif(trim(p_placement ->> 'placementStatus'), ''), 'draft');

  if normalized_status not in ('unplaced', 'draft', 'placed', 'aligned', 'reviewed') then
    raise exception 'Map piece placement status is not allowed.';
  end if;

  if p_placement -> 'corners' is null or jsonb_typeof(p_placement -> 'corners') <> 'object' then
    raise exception 'Map piece placement corners are required.';
  end if;

  perform 1
  where
    ((p_placement -> 'corners' -> 'northwest' ->> 'latitude')::double precision between -90 and 90)
    and ((p_placement -> 'corners' -> 'northwest' ->> 'longitude')::double precision between -180 and 180)
    and ((p_placement -> 'corners' -> 'northeast' ->> 'latitude')::double precision between -90 and 90)
    and ((p_placement -> 'corners' -> 'northeast' ->> 'longitude')::double precision between -180 and 180)
    and ((p_placement -> 'corners' -> 'southeast' ->> 'latitude')::double precision between -90 and 90)
    and ((p_placement -> 'corners' -> 'southeast' ->> 'longitude')::double precision between -180 and 180)
    and ((p_placement -> 'corners' -> 'southwest' ->> 'latitude')::double precision between -90 and 90)
    and ((p_placement -> 'corners' -> 'southwest' ->> 'longitude')::double precision between -180 and 180);

  if not found then
    raise exception 'Map piece placement corners are out of range.';
  end if;

  requested_georeference_id := coalesce(
    nullif(trim(p_placement ->> 'pieceGeoreferenceId'), ''),
    workspace.workspace_id || '-' || p_piece_id || '-piece-georef'
  );

  select id, map_piece_id
  into existing_placement
  from public.sanborn_map_piece_georeferences
  where piece_georeference_id = requested_georeference_id;

  if found and existing_placement.map_piece_id <> piece.map_piece_row_id then
    raise exception 'Map piece georeference ID belongs to another map piece.';
  end if;

  insert into public.sanborn_map_piece_georeferences (
    piece_georeference_id,
    town_package_id,
    workspace_id,
    atlas_page_id,
    map_piece_id,
    target_type,
    target_geometry,
    northwest_latitude,
    northwest_longitude,
    northeast_latitude,
    northeast_longitude,
    southeast_latitude,
    southeast_longitude,
    southwest_latitude,
    southwest_longitude,
    center_latitude,
    center_longitude,
    rotation,
    opacity,
    layer_order,
    placement_status,
    is_visible,
    is_locked,
    notes
  )
  values (
    requested_georeference_id,
    p_town_package_id,
    workspace.id,
    piece.atlas_page_id,
    piece.map_piece_row_id,
    'sanborn_map_piece',
    'polygon',
    (p_placement -> 'corners' -> 'northwest' ->> 'latitude')::double precision,
    (p_placement -> 'corners' -> 'northwest' ->> 'longitude')::double precision,
    (p_placement -> 'corners' -> 'northeast' ->> 'latitude')::double precision,
    (p_placement -> 'corners' -> 'northeast' ->> 'longitude')::double precision,
    (p_placement -> 'corners' -> 'southeast' ->> 'latitude')::double precision,
    (p_placement -> 'corners' -> 'southeast' ->> 'longitude')::double precision,
    (p_placement -> 'corners' -> 'southwest' ->> 'latitude')::double precision,
    (p_placement -> 'corners' -> 'southwest' ->> 'longitude')::double precision,
    center_latitude,
    center_longitude,
    normalized_rotation,
    normalized_opacity,
    normalized_layer_order,
    normalized_status,
    normalized_is_visible,
    normalized_is_locked,
    nullif(trim(p_placement ->> 'notes'), '')
  )
  on conflict (workspace_id, map_piece_id)
  do update set
    northwest_latitude = excluded.northwest_latitude,
    northwest_longitude = excluded.northwest_longitude,
    northeast_latitude = excluded.northeast_latitude,
    northeast_longitude = excluded.northeast_longitude,
    southeast_latitude = excluded.southeast_latitude,
    southeast_longitude = excluded.southeast_longitude,
    southwest_latitude = excluded.southwest_latitude,
    southwest_longitude = excluded.southwest_longitude,
    center_latitude = excluded.center_latitude,
    center_longitude = excluded.center_longitude,
    rotation = excluded.rotation,
    opacity = excluded.opacity,
    layer_order = excluded.layer_order,
    placement_status = excluded.placement_status,
    is_visible = excluded.is_visible,
    is_locked = excluded.is_locked,
    notes = excluded.notes
  returning id into placement_row_id;

  return jsonb_build_object(
    'ok', true,
    'workspaceId', workspace.workspace_id,
    'pieceId', p_piece_id,
    'placementRowId', placement_row_id,
    'reviewMetadata', 'preserved'
  );
end;
$$;

alter table public.sanborn_map_piece_georeferences enable row level security;

revoke all on table public.sanborn_map_piece_georeferences from PUBLIC;
revoke all on table public.sanborn_map_piece_georeferences from anon;
revoke all on table public.sanborn_map_piece_georeferences from authenticated;
grant select, insert, update, delete on table public.sanborn_map_piece_georeferences to service_role;

revoke execute on function public.save_sanborn_map_piece_georeference(uuid, text, text, integer, jsonb, double precision, text, jsonb) from PUBLIC;
revoke execute on function public.save_sanborn_map_piece_georeference(uuid, text, text, integer, jsonb, double precision, text, jsonb) from anon;
revoke execute on function public.save_sanborn_map_piece_georeference(uuid, text, text, integer, jsonb, double precision, text, jsonb) from authenticated;
grant execute on function public.save_sanborn_map_piece_georeference(uuid, text, text, integer, jsonb, double precision, text, jsonb) to service_role;
