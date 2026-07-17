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

revoke execute on function public.save_sanborn_map_piece_georeference(uuid, text, text, integer, jsonb, double precision, text, jsonb) from PUBLIC;
revoke execute on function public.save_sanborn_map_piece_georeference(uuid, text, text, integer, jsonb, double precision, text, jsonb) from anon;
revoke execute on function public.save_sanborn_map_piece_georeference(uuid, text, text, integer, jsonb, double precision, text, jsonb) from authenticated;
grant execute on function public.save_sanborn_map_piece_georeference(uuid, text, text, integer, jsonb, double precision, text, jsonb) to service_role;
