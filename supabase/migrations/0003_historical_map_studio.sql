create table if not exists public.historical_map_workspaces (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null unique,
  town_package_id uuid not null references public.town_packages(id) on delete cascade,
  map_year integer not null check (map_year > 0),
  name text not null,
  review_status review_status_enum not null default 'unknown',
  evidence_classification review_status_enum not null default 'unknown',
  viewport_x double precision not null default 0,
  viewport_y double precision not null default 0,
  viewport_scale double precision not null default 1 check (viewport_scale > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (town_package_id, map_year)
);

create table if not exists public.historical_map_sheet_placements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.historical_map_workspaces(id) on delete cascade,
  sanborn_sheet_asset_id uuid not null references public.sanborn_sheet_assets(id) on delete cascade,
  x double precision not null default 0,
  y double precision not null default 0,
  scale_x double precision not null default 1 check (scale_x > 0),
  scale_y double precision not null default 1 check (scale_y > 0),
  rotation double precision not null default 0,
  opacity double precision not null default 1 check (opacity >= 0 and opacity <= 1),
  layer_order integer not null default 0,
  is_visible boolean not null default true,
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, sanborn_sheet_asset_id)
);

create index if not exists idx_historical_map_workspaces_town_year
on public.historical_map_workspaces (town_package_id, map_year);

create index if not exists idx_historical_map_sheet_placements_workspace
on public.historical_map_sheet_placements (workspace_id);

create index if not exists idx_historical_map_sheet_placements_asset
on public.historical_map_sheet_placements (sanborn_sheet_asset_id);

drop trigger if exists set_historical_map_workspaces_updated_at on public.historical_map_workspaces;
create trigger set_historical_map_workspaces_updated_at
before update on public.historical_map_workspaces
for each row
execute function public.set_updated_at();

drop trigger if exists set_historical_map_sheet_placements_updated_at on public.historical_map_sheet_placements;
create trigger set_historical_map_sheet_placements_updated_at
before update on public.historical_map_sheet_placements
for each row
execute function public.set_updated_at();
