alter table public.historical_map_sheet_georeferences
  add column if not exists pivot_x double precision not null default 0.5 check (pivot_x >= 0 and pivot_x <= 1),
  add column if not exists pivot_y double precision not null default 0.5 check (pivot_y >= 0 and pivot_y <= 1),
  add column if not exists warp_type text not null default 'projective' check (warp_type in ('projective', 'affine', 'rectangular')),
  add column if not exists projective_matrix jsonb,
  add column if not exists transform_version integer not null default 1 check (transform_version > 0),
  add column if not exists placement_status text not null default 'placed' check (placement_status in ('unplaced', 'placed', 'aligned', 'reviewed'));

update public.historical_map_sheet_georeferences
set placement_status = case
    when is_visible then coalesce(nullif(placement_status, 'unplaced'), 'placed')
    else 'unplaced'
  end,
  warp_type = coalesce(warp_type, 'projective'),
  pivot_x = coalesce(pivot_x, 0.5),
  pivot_y = coalesce(pivot_y, 0.5),
  transform_version = greatest(coalesce(transform_version, 1), 1)
where placement_status is null
   or warp_type is null
   or pivot_x is null
   or pivot_y is null
   or transform_version is null;

alter table public.historical_map_sheet_georeferences
  drop constraint if exists historical_map_sheet_georeferences_projective_matrix_array;

alter table public.historical_map_sheet_georeferences
  add constraint historical_map_sheet_georeferences_projective_matrix_array
  check (
    projective_matrix is null
    or (
      jsonb_typeof(projective_matrix) = 'array'
      and jsonb_array_length(projective_matrix) = 9
    )
  );

create index if not exists idx_historical_map_sheet_georeferences_placement_status
on public.historical_map_sheet_georeferences (town_package_id, map_year, placement_status);
