alter table public.historical_map_sheet_placements
  add column if not exists skew_x double precision not null default 0,
  add column if not exists skew_y double precision not null default 0,
  add column if not exists is_flipped_horizontally boolean not null default false,
  add column if not exists is_flipped_vertically boolean not null default false;

alter table public.historical_map_sheet_placements
  drop constraint if exists historical_map_sheet_placements_skew_x_range,
  drop constraint if exists historical_map_sheet_placements_skew_y_range;

alter table public.historical_map_sheet_placements
  add constraint historical_map_sheet_placements_skew_x_range check (skew_x >= -45 and skew_x <= 45),
  add constraint historical_map_sheet_placements_skew_y_range check (skew_y >= -45 and skew_y <= 45);
