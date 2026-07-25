-- PR #85: preserve the existing polygon corner model while adding explicit
-- feature placement geometry and unable-to-place review metadata.
-- Rollback: remove only the added JSON/reviewer columns and restore the prior
-- placement-status/target-geometry checks; existing polygon corners remain intact.

alter table public.sanborn_map_piece_georeferences
  drop constraint if exists sanborn_map_piece_georeferences_target_geometry_check,
  drop constraint if exists sanborn_map_piece_georeferences_placement_status_check,
  add constraint sanborn_map_piece_georeferences_target_geometry_check check (target_geometry in ('polygon', 'line', 'point', 'junction')),
  add constraint sanborn_map_piece_georeferences_placement_status_check check (placement_status in ('unplaced', 'draft', 'placed', 'aligned', 'reviewed', 'unable_to_place'));

alter table public.sanborn_map_piece_georeferences
  add column if not exists geographic_geometry jsonb,
  add column if not exists unable_to_place_reason text,
  add column if not exists reviewer_identity text,
  add column if not exists reviewed_at timestamptz;

alter table public.sanborn_map_piece_georeferences
  add constraint sanborn_map_piece_georeferences_geographic_geometry_object_check check (geographic_geometry is null or jsonb_typeof(geographic_geometry) = 'object');

create index if not exists idx_sanborn_map_piece_georeferences_status
on public.sanborn_map_piece_georeferences (atlas_page_id, placement_status);

create or replace function public.save_sanborn_map_piece_feature_placement(
  p_town_package_id uuid,
  p_map_year integer,
  p_piece_id text,
  p_target_geometry text,
  p_geographic_geometry jsonb,
  p_placement_status text,
  p_unable_to_place_reason text default null,
  p_reviewer_identity text default null,
  p_reviewed_at timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  workspace_row uuid;
  piece_row uuid;
begin
  if p_target_geometry not in ('polygon', 'line', 'point', 'junction') then
    raise exception 'Map piece feature geometry is not allowed.';
  end if;

  if p_placement_status not in ('unplaced', 'draft', 'placed', 'aligned', 'reviewed', 'unable_to_place') then
    raise exception 'Map piece feature placement status is not allowed.';
  end if;

  if p_placement_status = 'unable_to_place' and nullif(trim(p_unable_to_place_reason), '') is null then
    raise exception 'Unable to place requires a reason.';
  end if;

  select id into workspace_row
  from public.historical_map_workspaces
  where town_package_id = p_town_package_id and map_year = p_map_year;

  if workspace_row is null then
    raise exception 'Historical Map Studio workspace was not found.';
  end if;

  select map_piece.id into piece_row
  from public.sanborn_map_pieces as map_piece
  join public.sanborn_atlas_pages as atlas_page on atlas_page.id = map_piece.atlas_page_id
  join public.sanborn_atlases as atlas on atlas.id = atlas_page.atlas_id
  where map_piece.piece_id = p_piece_id and atlas.town_package_id = p_town_package_id;

  if piece_row is null then
    raise exception 'Sanborn map piece was not found in the requested town package.';
  end if;

  update public.sanborn_map_piece_georeferences
  set target_geometry = p_target_geometry,
      geographic_geometry = p_geographic_geometry,
      placement_status = p_placement_status,
      unable_to_place_reason = nullif(trim(p_unable_to_place_reason), ''),
      reviewer_identity = nullif(trim(p_reviewer_identity), ''),
      reviewed_at = p_reviewed_at,
      updated_at = now()
  where workspace_id = workspace_row and map_piece_id = piece_row;

  if not found then
    raise exception 'Map piece placement was not found after the base placement save.';
  end if;

  return jsonb_build_object('ok', true, 'pieceId', p_piece_id);
end;
$$;

revoke execute on function public.save_sanborn_map_piece_feature_placement(uuid, integer, text, text, jsonb, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.save_sanborn_map_piece_feature_placement(uuid, integer, text, text, jsonb, text, text, text, timestamptz) to service_role;
