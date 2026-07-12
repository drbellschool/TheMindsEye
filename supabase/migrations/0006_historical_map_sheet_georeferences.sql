alter table public.historical_map_workspaces
  add column if not exists selected_basemap text not null default 'osm',
  add column if not exists geographic_center_latitude double precision check (geographic_center_latitude between -90 and 90),
  add column if not exists geographic_center_longitude double precision check (geographic_center_longitude between -180 and 180),
  add column if not exists geographic_zoom double precision not null default 15 check (geographic_zoom > 0 and geographic_zoom <= 22),
  add column if not exists geographic_edit_mode text not null default 'pan_modern_map' check (geographic_edit_mode in ('pan_modern_map', 'edit_historical_sheets')),
  add column if not exists global_historical_opacity double precision not null default 1 check (global_historical_opacity >= 0 and global_historical_opacity <= 1);

create table if not exists public.historical_map_sheet_georeferences (
  id uuid primary key default gen_random_uuid(),
  sheet_georeference_id text not null unique,
  workspace_id uuid not null references public.historical_map_workspaces(id) on delete cascade,
  sanborn_sheet_asset_id uuid not null references public.sanborn_sheet_assets(id) on delete cascade,
  town_package_id uuid not null references public.town_packages(id) on delete cascade,
  map_year integer not null check (map_year > 0),
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
  longitude_span double precision not null check (longitude_span > 0 and longitude_span <= 5),
  latitude_span double precision not null check (latitude_span > 0 and latitude_span <= 5),
  rotation double precision not null default 0,
  scale_x double precision not null default 1 check (scale_x > 0 and scale_x <= 8),
  scale_y double precision not null default 1 check (scale_y > 0 and scale_y <= 8),
  skew_x double precision not null default 0 check (skew_x >= -45 and skew_x <= 45),
  skew_y double precision not null default 0 check (skew_y >= -45 and skew_y <= 45),
  is_flipped_horizontally boolean not null default false,
  is_flipped_vertically boolean not null default false,
  opacity double precision not null default 1 check (opacity >= 0 and opacity <= 1),
  layer_order integer not null default 0,
  is_visible boolean not null default true,
  is_locked boolean not null default false,
  georeference_status text not null default 'not_started' check (georeference_status in ('not_started', 'bounding_box', 'control_points_draft', 'aligned_draft', 'reviewed')),
  review_status review_status_enum not null default 'unknown',
  evidence_classification review_status_enum not null default 'unknown',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, sanborn_sheet_asset_id)
);

create index if not exists idx_historical_map_sheet_georeferences_workspace
on public.historical_map_sheet_georeferences (workspace_id, layer_order);

create index if not exists idx_historical_map_sheet_georeferences_town_year
on public.historical_map_sheet_georeferences (town_package_id, map_year);

create index if not exists idx_historical_map_sheet_georeferences_asset
on public.historical_map_sheet_georeferences (sanborn_sheet_asset_id);

drop trigger if exists set_historical_map_sheet_georeferences_updated_at on public.historical_map_sheet_georeferences;
create trigger set_historical_map_sheet_georeferences_updated_at
before update on public.historical_map_sheet_georeferences
for each row
execute function public.set_updated_at();

alter table public.historical_map_control_points
  add column if not exists sanborn_sheet_asset_id uuid references public.sanborn_sheet_assets(id) on delete cascade,
  add column if not exists residual_error double precision check (residual_error is null or residual_error >= 0),
  add column if not exists is_complete boolean not null default false;

create index if not exists idx_historical_map_control_points_sheet
on public.historical_map_control_points (sanborn_sheet_asset_id);
