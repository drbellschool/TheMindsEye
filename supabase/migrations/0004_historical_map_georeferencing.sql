create table if not exists public.historical_map_georeferences (
  id uuid primary key default gen_random_uuid(),
  georeference_id text not null unique,
  workspace_id uuid not null references public.historical_map_workspaces(id) on delete cascade,
  sanborn_sheet_asset_id uuid references public.sanborn_sheet_assets(id) on delete cascade,
  town_package_id uuid not null references public.town_packages(id) on delete cascade,
  map_year integer not null check (map_year > 0),
  target_type text not null check (target_type in ('sheet', 'workspace')),
  status text not null default 'not_started' check (status in ('not_started', 'bounding_box', 'control_points_draft', 'aligned_draft', 'reviewed')),
  transformation_type text not null default 'none' check (transformation_type in ('none', 'bounding_box', 'affine')),
  north_latitude double precision check (north_latitude between -90 and 90),
  south_latitude double precision check (south_latitude between -90 and 90),
  east_longitude double precision check (east_longitude between -180 and 180),
  west_longitude double precision check (west_longitude between -180 and 180),
  northwest_latitude double precision check (northwest_latitude between -90 and 90),
  northwest_longitude double precision check (northwest_longitude between -180 and 180),
  northeast_latitude double precision check (northeast_latitude between -90 and 90),
  northeast_longitude double precision check (northeast_longitude between -180 and 180),
  southeast_latitude double precision check (southeast_latitude between -90 and 90),
  southeast_longitude double precision check (southeast_longitude between -180 and 180),
  southwest_latitude double precision check (southwest_latitude between -90 and 90),
  southwest_longitude double precision check (southwest_longitude between -180 and 180),
  transform_matrix jsonb,
  residual_error double precision check (residual_error is null or residual_error >= 0),
  control_point_count integer not null default 0 check (control_point_count >= 0),
  selected_basemap text not null default 'osm',
  overlay_opacity double precision not null default 0.65 check (overlay_opacity >= 0 and overlay_opacity <= 1),
  overlay_visible boolean not null default true,
  show_control_points boolean not null default true,
  show_sheet_boundaries boolean not null default true,
  rendering_mode text not null default 'rectangular_preview' check (rendering_mode in ('rectangular_preview', 'warped_preview')),
  review_status review_status_enum not null default 'unknown',
  evidence_classification review_status_enum not null default 'unknown',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.historical_map_control_points (
  id uuid primary key default gen_random_uuid(),
  control_point_id text not null unique,
  georeference_id uuid not null references public.historical_map_georeferences(id) on delete cascade,
  label text not null,
  image_x double precision,
  image_y double precision,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  confidence text not null default 'draft',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_historical_map_georeferences_workspace
on public.historical_map_georeferences (workspace_id);

create index if not exists idx_historical_map_georeferences_town_year
on public.historical_map_georeferences (town_package_id, map_year);

create index if not exists idx_historical_map_georeferences_sheet
on public.historical_map_georeferences (sanborn_sheet_asset_id);

create unique index if not exists idx_historical_map_georeferences_one_workspace_target
on public.historical_map_georeferences (workspace_id)
where target_type = 'workspace' and sanborn_sheet_asset_id is null;

create unique index if not exists idx_historical_map_georeferences_one_sheet_target
on public.historical_map_georeferences (workspace_id, sanborn_sheet_asset_id)
where target_type = 'sheet';

create index if not exists idx_historical_map_control_points_georeference
on public.historical_map_control_points (georeference_id);

drop trigger if exists set_historical_map_georeferences_updated_at on public.historical_map_georeferences;
create trigger set_historical_map_georeferences_updated_at
before update on public.historical_map_georeferences
for each row
execute function public.set_updated_at();

drop trigger if exists set_historical_map_control_points_updated_at on public.historical_map_control_points;
create trigger set_historical_map_control_points_updated_at
before update on public.historical_map_control_points
for each row
execute function public.set_updated_at();
