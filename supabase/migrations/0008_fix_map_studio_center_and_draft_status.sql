alter table public.town_packages
  add column if not exists center_latitude double precision check (center_latitude is null or center_latitude between -90 and 90),
  add column if not exists center_longitude double precision check (center_longitude is null or center_longitude between -180 and 180),
  add column if not exists default_zoom double precision check (default_zoom is null or (default_zoom > 0 and default_zoom <= 22));

update public.town_packages
set center_latitude = 33.425,
    center_longitude = -94.047,
    default_zoom = 15
where package_id = 'texarkana_1885'
  and (
    center_latitude is null
    or center_longitude is null
    or abs(center_latitude) < 0.000001
    or abs(center_longitude) < 0.000001
    or default_zoom is null
  );

alter table public.historical_map_sheet_georeferences
  drop constraint if exists historical_map_sheet_georeferences_placement_status_check,
  drop constraint if exists historical_map_sheet_georeferences_placement_status_allowed;

alter table public.historical_map_sheet_georeferences
  alter column placement_status set default 'unplaced';

alter table public.historical_map_sheet_georeferences
  add constraint historical_map_sheet_georeferences_placement_status_allowed
  check (placement_status in ('unplaced', 'draft', 'placed', 'aligned', 'reviewed'));

update public.historical_map_workspaces workspace
set geographic_center_latitude = town.center_latitude,
    geographic_center_longitude = town.center_longitude,
    geographic_zoom = coalesce(town.default_zoom, workspace.geographic_zoom, 15)
from public.town_packages town
where workspace.town_package_id = town.id
  and town.center_latitude is not null
  and town.center_longitude is not null
  and (
    workspace.geographic_center_latitude is null
    or workspace.geographic_center_longitude is null
    or (abs(workspace.geographic_center_latitude) < 0.000001 and abs(workspace.geographic_center_longitude) < 0.000001)
  );

with invalid_placements as (
  select
    georef.id,
    town.center_latitude,
    town.center_longitude,
    greatest(coalesce(georef.latitude_span, 0.003), 0.0008) as latitude_span,
    greatest(coalesce(georef.longitude_span, 0.004), 0.0008) as longitude_span,
    row_number() over (partition by georef.workspace_id order by georef.layer_order, georef.id) - 1 as placement_index
  from public.historical_map_sheet_georeferences georef
  join public.town_packages town on town.id = georef.town_package_id
  where town.center_latitude is not null
    and town.center_longitude is not null
    and abs(georef.center_latitude) < 0.000001
    and abs(georef.center_longitude) < 0.000001
    and abs(georef.northwest_latitude) < 0.000001
    and abs(georef.northwest_longitude) < 0.000001
    and abs(georef.northeast_latitude) < 0.000001
    and abs(georef.northeast_longitude) < 0.000001
    and abs(georef.southeast_latitude) < 0.000001
    and abs(georef.southeast_longitude) < 0.000001
    and abs(georef.southwest_latitude) < 0.000001
    and abs(georef.southwest_longitude) < 0.000001
)
update public.historical_map_sheet_georeferences georef
set center_latitude = invalid.center_latitude - (floor(invalid.placement_index / 4.0) * invalid.latitude_span * 1.15),
    center_longitude = invalid.center_longitude + ((invalid.placement_index % 4) * invalid.longitude_span * 1.15),
    northwest_latitude = invalid.center_latitude + (invalid.latitude_span / 2.0) - (floor(invalid.placement_index / 4.0) * invalid.latitude_span * 1.15),
    northwest_longitude = invalid.center_longitude - (invalid.longitude_span / 2.0) + ((invalid.placement_index % 4) * invalid.longitude_span * 1.15),
    northeast_latitude = invalid.center_latitude + (invalid.latitude_span / 2.0) - (floor(invalid.placement_index / 4.0) * invalid.latitude_span * 1.15),
    northeast_longitude = invalid.center_longitude + (invalid.longitude_span / 2.0) + ((invalid.placement_index % 4) * invalid.longitude_span * 1.15),
    southeast_latitude = invalid.center_latitude - (invalid.latitude_span / 2.0) - (floor(invalid.placement_index / 4.0) * invalid.latitude_span * 1.15),
    southeast_longitude = invalid.center_longitude + (invalid.longitude_span / 2.0) + ((invalid.placement_index % 4) * invalid.longitude_span * 1.15),
    southwest_latitude = invalid.center_latitude - (invalid.latitude_span / 2.0) - (floor(invalid.placement_index / 4.0) * invalid.latitude_span * 1.15),
    southwest_longitude = invalid.center_longitude - (invalid.longitude_span / 2.0) + ((invalid.placement_index % 4) * invalid.longitude_span * 1.15),
    opacity = greatest(coalesce(georef.opacity, 0.72), 0.72),
    placement_status = 'draft',
    georeference_status = 'bounding_box',
    transform_version = greatest(coalesce(georef.transform_version, 1), 1) + 1,
    updated_at = now()
from invalid_placements invalid
where georef.id = invalid.id;

