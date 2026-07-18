create or replace function public.sanborn_map_piece_geographic_quad_is_valid(
  p_northwest_latitude double precision,
  p_northwest_longitude double precision,
  p_northeast_latitude double precision,
  p_northeast_longitude double precision,
  p_southeast_latitude double precision,
  p_southeast_longitude double precision,
  p_southwest_latitude double precision,
  p_southwest_longitude double precision
)
returns boolean
language sql
immutable
security invoker
set search_path = public
as $$
  with geometry as (
    select
      p_northwest_longitude as ax,
      p_northwest_latitude as ay,
      p_northeast_longitude as bx,
      p_northeast_latitude as by,
      p_southeast_longitude as cx,
      p_southeast_latitude as cy,
      p_southwest_longitude as dx,
      p_southwest_latitude as dy
  ),
  measurements as (
    select
      *,
      ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) as cross_abc,
      ((cx - bx) * (dy - by) - (cy - by) * (dx - bx)) as cross_bcd,
      ((dx - cx) * (ay - cy) - (dy - cy) * (ax - cx)) as cross_cda,
      ((ax - dx) * (by - dy) - (ay - dy) * (bx - dx)) as cross_dab,
      ((bx - ax) * (dy - ay) - (by - ay) * (dx - ax)) as cross_abd,
      ((dx - cx) * (ay - cy) - (dy - cy) * (ax - cx)) as cross_cda_for_edges,
      ((dx - cx) * (by - cy) - (dy - cy) * (bx - cx)) as cross_cdb,
      ((cx - bx) * (ay - by) - (cy - by) * (ax - bx)) as cross_bca,
      ((ax - dx) * (by - dy) - (ay - dy) * (bx - dx)) as cross_dab_for_edges,
      ((ax - dx) * (cy - dy) - (ay - dy) * (cx - dx)) as cross_dac,
      abs((ax * by - bx * ay + bx * cy - cx * by + cx * dy - dx * cy + dx * ay - ax * dy) / 2.0) as polygon_area
    from geometry
  )
  select coalesce(
    p_northwest_latitude between -90 and 90
    and p_northwest_longitude between -180 and 180
    and p_northeast_latitude between -90 and 90
    and p_northeast_longitude between -180 and 180
    and p_southeast_latitude between -90 and 90
    and p_southeast_longitude between -180 and 180
    and p_southwest_latitude between -90 and 90
    and p_southwest_longitude between -180 and 180
    and (abs(ax - bx) > 0.0000000001 or abs(ay - by) > 0.0000000001)
    and (abs(ax - cx) > 0.0000000001 or abs(ay - cy) > 0.0000000001)
    and (abs(ax - dx) > 0.0000000001 or abs(ay - dy) > 0.0000000001)
    and (abs(bx - cx) > 0.0000000001 or abs(by - cy) > 0.0000000001)
    and (abs(bx - dx) > 0.0000000001 or abs(by - dy) > 0.0000000001)
    and (abs(cx - dx) > 0.0000000001 or abs(cy - dy) > 0.0000000001)
    and polygon_area > 0.000000000001
    and not (cross_abc * cross_abd < -0.000000000001 and cross_cda_for_edges * cross_cdb < -0.000000000001)
    and not (cross_bcd * cross_bca < -0.000000000001 and cross_dab_for_edges * cross_dac < -0.000000000001)
    and cross_abc < -0.000000000001
    and cross_bcd < -0.000000000001
    and cross_cda < -0.000000000001
    and cross_dab < -0.000000000001,
    false
  )
  from measurements;
$$;

create table if not exists public.sanborn_map_piece_georeferences (
  id uuid primary key default gen_random_uuid(),
  piece_georeference_id text not null unique,
  town_package_id uuid not null references public.town_packages(id) on delete cascade,
  workspace_id uuid not null references public.historical_map_workspaces(id) on delete cascade,
  atlas_page_id uuid not null references public.sanborn_atlas_pages(id) on delete cascade,
  map_piece_id uuid not null references public.sanborn_map_pieces(id) on delete cascade,
  target_type text not null default 'sanborn_map_piece' check (target_type = 'sanborn_map_piece'),
  target_geometry text not null default 'polygon' check (target_geometry = 'polygon'),
  northwest_latitude double precision not null check (northwest_latitude between -90 and 90),
  northwest_longitude double precision not null check (northwest_longitude between -180 and 180),
  northeast_latitude double precision not null check (northeast_latitude between -90 and 90),
  northeast_longitude double precision not null check (northeast_longitude between -180 and 180),
  southeast_latitude double precision not null check (southeast_latitude between -90 and 90),
  southeast_longitude double precision not null check (southeast_longitude between -180 and 180),
  southwest_latitude double precision not null check (southwest_latitude between -90 and 90),
  southwest_longitude double precision not null check (southwest_longitude between -180 and 180),
  constraint sanborn_map_piece_georeferences_geographic_quad_check check (
    public.sanborn_map_piece_geographic_quad_is_valid(
      northwest_latitude,
      northwest_longitude,
      northeast_latitude,
      northeast_longitude,
      southeast_latitude,
      southeast_longitude,
      southwest_latitude,
      southwest_longitude
    )
  ),
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
  piece_scope record;
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
  normalized_target_type text;
  normalized_target_geometry text;
  northwest_latitude double precision;
  northwest_longitude double precision;
  northeast_latitude double precision;
  northeast_longitude double precision;
  southeast_latitude double precision;
  southeast_longitude double precision;
  southwest_latitude double precision;
  southwest_longitude double precision;
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

  normalized_target_type := coalesce(nullif(trim(p_placement ->> 'targetType'), ''), 'sanborn_map_piece');
  normalized_target_geometry := coalesce(nullif(trim(p_placement ->> 'targetGeometry'), ''), 'polygon');

  if normalized_target_type <> 'sanborn_map_piece' then
    raise exception 'Map piece placement target type must be sanborn_map_piece.';
  end if;

  if normalized_target_geometry <> 'polygon' then
    raise exception 'Map piece placement target geometry must be polygon.';
  end if;

  select id, package_id, name, year
  into town
  from public.town_packages
  where id = p_town_package_id;

  if not found then
    raise exception 'Town package was not found.';
  end if;

  select
    map_piece_row.id as map_piece_row_id,
    map_piece_row.piece_id,
    map_piece_row.atlas_page_id,
    atlas_page_row.page_id,
    atlas_row.town_package_id
  into piece_scope
  from public.sanborn_map_pieces as map_piece_row
  join public.sanborn_atlas_pages as atlas_page_row on atlas_page_row.id = map_piece_row.atlas_page_id
  join public.sanborn_atlases as atlas_row on atlas_row.id = atlas_page_row.atlas_id
  where map_piece_row.piece_id = p_piece_id;

  if not found then
    raise exception 'Sanborn map piece was not found.';
  end if;

  if piece_scope.town_package_id <> p_town_package_id then
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

  begin
    northwest_latitude := (p_placement -> 'corners' -> 'northwest' ->> 'latitude')::double precision;
    northwest_longitude := (p_placement -> 'corners' -> 'northwest' ->> 'longitude')::double precision;
    northeast_latitude := (p_placement -> 'corners' -> 'northeast' ->> 'latitude')::double precision;
    northeast_longitude := (p_placement -> 'corners' -> 'northeast' ->> 'longitude')::double precision;
    southeast_latitude := (p_placement -> 'corners' -> 'southeast' ->> 'latitude')::double precision;
    southeast_longitude := (p_placement -> 'corners' -> 'southeast' ->> 'longitude')::double precision;
    southwest_latitude := (p_placement -> 'corners' -> 'southwest' ->> 'latitude')::double precision;
    southwest_longitude := (p_placement -> 'corners' -> 'southwest' ->> 'longitude')::double precision;
  exception when others then
    raise exception 'Map piece placement corners contain invalid numeric values.';
  end;

  if not public.sanborn_map_piece_geographic_quad_is_valid(
    northwest_latitude,
    northwest_longitude,
    northeast_latitude,
    northeast_longitude,
    southeast_latitude,
    southeast_longitude,
    southwest_latitude,
    southwest_longitude
  ) then
    raise exception 'Map piece placement corners must form a valid, non-crossing geographic quadrilateral.';
  end if;

  requested_georeference_id := coalesce(
    nullif(trim(p_placement ->> 'pieceGeoreferenceId'), ''),
    workspace.workspace_id || '-' || p_piece_id || '-piece-georef'
  );

  select id, map_piece_id
  into existing_placement
  from public.sanborn_map_piece_georeferences
  where piece_georeference_id = requested_georeference_id;

  if found and existing_placement.map_piece_id <> piece_scope.map_piece_row_id then
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
    piece_scope.atlas_page_id,
    piece_scope.map_piece_row_id,
    'sanborn_map_piece',
    'polygon',
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

revoke execute on function public.sanborn_map_piece_geographic_quad_is_valid(double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) from PUBLIC;
revoke execute on function public.sanborn_map_piece_geographic_quad_is_valid(double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) from anon;
revoke execute on function public.sanborn_map_piece_geographic_quad_is_valid(double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) from authenticated;
grant execute on function public.sanborn_map_piece_geographic_quad_is_valid(double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) to service_role;

revoke execute on function public.save_sanborn_map_piece_georeference(uuid, text, text, integer, jsonb, double precision, text, jsonb) from PUBLIC;
revoke execute on function public.save_sanborn_map_piece_georeference(uuid, text, text, integer, jsonb, double precision, text, jsonb) from anon;
revoke execute on function public.save_sanborn_map_piece_georeference(uuid, text, text, integer, jsonb, double precision, text, jsonb) from authenticated;
grant execute on function public.save_sanborn_map_piece_georeference(uuid, text, text, integer, jsonb, double precision, text, jsonb) to service_role;
