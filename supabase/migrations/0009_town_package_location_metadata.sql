alter table public.town_packages
  add column if not exists location_query text,
  add column if not exists location_display_name text,
  add column if not exists location_north double precision check (location_north is null or location_north between -90 and 90),
  add column if not exists location_south double precision check (location_south is null or location_south between -90 and 90),
  add column if not exists location_east double precision check (location_east is null or location_east between -180 and 180),
  add column if not exists location_west double precision check (location_west is null or location_west between -180 and 180);

update public.town_packages
set
  center_latitude = coalesce(center_latitude, 33.425),
  center_longitude = coalesce(center_longitude, -94.047),
  default_zoom = coalesce(default_zoom, 15),
  location_query = coalesce(location_query, 'Texarkana, Texas'),
  location_display_name = coalesce(location_display_name, 'Texarkana, Bowie County, Texas, United States'),
  location_north = coalesce(location_north, 33.53),
  location_south = coalesce(location_south, 33.33),
  location_east = coalesce(location_east, -93.93),
  location_west = coalesce(location_west, -94.18)
where package_id = 'texarkana_1885';
