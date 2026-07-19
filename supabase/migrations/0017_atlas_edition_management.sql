-- 0017_atlas_edition_management

alter table public.sanborn_atlases
  add column if not exists notes text,
  add column if not exists archived_at timestamptz,
  add column if not exists archive_reason text;

alter table public.sanborn_atlas_pages
  add column if not exists archived_at timestamptz,
  add column if not exists archive_reason text;

create index if not exists idx_sanborn_atlases_active_town_edition
on public.sanborn_atlases (town_package_id, edition_year)
where archived_at is null;

create index if not exists idx_sanborn_atlas_pages_active_atlas_sequence
on public.sanborn_atlas_pages (atlas_id, page_sequence)
where archived_at is null;

create or replace function public.archive_sanborn_atlas(
  p_town_package_id uuid,
  p_atlas_id text,
  p_archive_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  atlas_scope record;
  page_count integer;
  source_region_count integer;
  map_piece_count integer;
  placement_count integer;
begin
  select atlas_row.id, atlas_row.atlas_id, atlas_row.town_package_id
  into atlas_scope
  from public.sanborn_atlases as atlas_row
  where atlas_row.atlas_id = p_atlas_id;

  if not found then
    raise exception 'Sanborn atlas was not found.';
  end if;

  if atlas_scope.town_package_id <> p_town_package_id then
    raise exception 'Atlas ID belongs to another town package.';
  end if;

  select count(*) into page_count
  from public.sanborn_atlas_pages as page_row
  where page_row.atlas_id = atlas_scope.id
    and page_row.archived_at is null;

  select count(*) into source_region_count
  from public.sanborn_source_regions as region_row
  where region_row.atlas_id = atlas_scope.id;

  select count(*) into map_piece_count
  from public.sanborn_map_pieces as map_piece_row
  join public.sanborn_atlas_pages as page_row
    on page_row.id = map_piece_row.atlas_page_id
  where page_row.atlas_id = atlas_scope.id;

  select count(*) into placement_count
  from public.sanborn_map_piece_georeferences as placement_row
  join public.sanborn_map_pieces as map_piece_row
    on map_piece_row.id = placement_row.map_piece_id
  join public.sanborn_atlas_pages as page_row
    on page_row.id = map_piece_row.atlas_page_id
  where page_row.atlas_id = atlas_scope.id;

  update public.sanborn_atlases as atlas_row
  set
    archived_at = coalesce(atlas_row.archived_at, now()),
    archive_reason = nullif(trim(p_archive_reason), ''),
    updated_at = now()
  where atlas_row.id = atlas_scope.id;

  return jsonb_build_object(
    'ok', true,
    'atlasId', p_atlas_id,
    'pageCount', page_count,
    'sourceRegionCount', source_region_count,
    'mapPieceCount', map_piece_count,
    'placementCount', placement_count,
    'archivedAt', now()
  );
end;
$$;

create or replace function public.archive_sanborn_atlas_page(
  p_town_package_id uuid,
  p_page_id text,
  p_archive_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  page_scope record;
  source_region_count integer;
  map_piece_count integer;
  placement_count integer;
begin
  select
    page_row.id,
    page_row.page_id,
    page_row.atlas_id,
    page_row.sanborn_sheet_asset_id,
    atlas_row.town_package_id
  into page_scope
  from public.sanborn_atlas_pages as page_row
  join public.sanborn_atlases as atlas_row
    on atlas_row.id = page_row.atlas_id
  where page_row.page_id = p_page_id;

  if not found then
    raise exception 'Sanborn atlas page was not found.';
  end if;

  if page_scope.town_package_id <> p_town_package_id then
    raise exception 'Atlas page belongs to another town package.';
  end if;

  select count(*) into source_region_count
  from public.sanborn_source_regions as region_row
  where region_row.atlas_page_id = page_scope.id
     or region_row.linked_atlas_page_id = page_scope.id
     or region_row.linked_sheet_asset_id = page_scope.sanborn_sheet_asset_id;

  select count(*) into map_piece_count
  from public.sanborn_map_pieces as map_piece_row
  where map_piece_row.atlas_page_id = page_scope.id;

  select count(*) into placement_count
  from public.sanborn_map_piece_georeferences as placement_row
  join public.sanborn_map_pieces as map_piece_row
    on map_piece_row.id = placement_row.map_piece_id
  where map_piece_row.atlas_page_id = page_scope.id;

  update public.sanborn_atlas_pages as page_row
  set
    archived_at = coalesce(page_row.archived_at, now()),
    archive_reason = nullif(trim(p_archive_reason), ''),
    updated_at = now()
  where page_row.id = page_scope.id;

  return jsonb_build_object(
    'ok', true,
    'pageId', p_page_id,
    'sourceRegionCount', source_region_count,
    'mapPieceCount', map_piece_count,
    'placementCount', placement_count,
    'archivedAt', now()
  );
end;
$$;

create or replace function public.move_sanborn_atlas_page_to_atlas(
  p_town_package_id uuid,
  p_page_id text,
  p_destination_atlas_id text,
  p_move_child_work boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  source_page_scope record;
  destination_atlas_scope record;
  next_page_sequence integer;
  source_region_count integer;
  map_piece_count integer;
  map_piece_placement_count integer;
  whole_sheet_georeference_count integer;
  whole_sheet_placement_count integer;
  external_link_count integer;
  cross_link_count integer;
begin
  if p_town_package_id is null or nullif(trim(p_page_id), '') is null or nullif(trim(p_destination_atlas_id), '') is null then
    raise exception 'Page move requires a town package, source page, and destination atlas.';
  end if;

  select
    page_row.id as page_row_id,
    page_row.page_id,
    page_row.atlas_id as source_atlas_row_id,
    page_row.sanborn_sheet_asset_id,
    source_atlas_row.atlas_id as source_atlas_id,
    source_atlas_row.town_package_id
  into source_page_scope
  from public.sanborn_atlas_pages as page_row
  join public.sanborn_atlases as source_atlas_row
    on source_atlas_row.id = page_row.atlas_id
  where page_row.page_id = p_page_id;

  if not found then
    raise exception 'Sanborn atlas page was not found.';
  end if;

  if source_page_scope.town_package_id <> p_town_package_id then
    raise exception 'Atlas page belongs to another town package.';
  end if;

  select atlas_row.id, atlas_row.atlas_id, atlas_row.town_package_id, atlas_row.volume_label
  into destination_atlas_scope
  from public.sanborn_atlases as atlas_row
  where atlas_row.atlas_id = p_destination_atlas_id;

  if not found then
    raise exception 'Destination Sanborn atlas was not found.';
  end if;

  if destination_atlas_scope.town_package_id <> p_town_package_id then
    raise exception 'Destination atlas belongs to another town package.';
  end if;

  if destination_atlas_scope.id = source_page_scope.source_atlas_row_id then
    raise exception 'Destination atlas is already assigned to this page.';
  end if;

  select count(*) into source_region_count
  from public.sanborn_source_regions as region_row
  where region_row.atlas_page_id = source_page_scope.page_row_id;

  select count(*) into map_piece_count
  from public.sanborn_map_pieces as map_piece_row
  where map_piece_row.atlas_page_id = source_page_scope.page_row_id;

  select count(*) into map_piece_placement_count
  from public.sanborn_map_piece_georeferences as placement_row
  join public.sanborn_map_pieces as map_piece_row
    on map_piece_row.id = placement_row.map_piece_id
  where map_piece_row.atlas_page_id = source_page_scope.page_row_id;

  select count(*) into whole_sheet_georeference_count
  from public.historical_map_sheet_georeferences as sheet_georeference_row
  where sheet_georeference_row.sanborn_sheet_asset_id = source_page_scope.sanborn_sheet_asset_id;

  select count(*) into whole_sheet_placement_count
  from public.historical_map_sheet_placements as placement_row
  where placement_row.sanborn_sheet_asset_id = source_page_scope.sanborn_sheet_asset_id;

  select count(*) into external_link_count
  from public.sanborn_source_regions as region_row
  where region_row.atlas_page_id <> source_page_scope.page_row_id
    and (
      region_row.linked_atlas_page_id = source_page_scope.page_row_id
      or region_row.linked_sheet_asset_id = source_page_scope.sanborn_sheet_asset_id
    );

  select count(*) into cross_link_count
  from public.sanborn_source_regions as region_row
  left join public.sanborn_atlas_pages as linked_page_row
    on linked_page_row.id = region_row.linked_atlas_page_id
  left join public.sanborn_atlas_pages as linked_asset_page_row
    on linked_asset_page_row.sanborn_sheet_asset_id = region_row.linked_sheet_asset_id
    and linked_asset_page_row.archived_at is null
  where region_row.atlas_page_id = source_page_scope.page_row_id
    and (
      (linked_page_row.id is not null and linked_page_row.atlas_id <> destination_atlas_scope.id and linked_page_row.id <> source_page_scope.page_row_id)
      or (linked_asset_page_row.id is not null and linked_asset_page_row.atlas_id <> destination_atlas_scope.id and linked_asset_page_row.id <> source_page_scope.page_row_id)
    );

  if (source_region_count + map_piece_count + map_piece_placement_count + whole_sheet_georeference_count + whole_sheet_placement_count) > 0
    and p_move_child_work is not true then
    raise exception 'Page has edition-scoped child work. Confirm a compatible move before changing editions.';
  end if;

  if external_link_count > 0 then
    raise exception 'Other index regions link to this page. Clear those links before moving it to another edition.';
  end if;

  if cross_link_count > 0 then
    raise exception 'Source regions on this page link to sheets outside the destination edition.';
  end if;

  if map_piece_placement_count > 0 then
    raise exception 'Map-piece placements must be reviewed before moving this page to another edition.';
  end if;

  if (whole_sheet_georeference_count + whole_sheet_placement_count) > 0 then
    raise exception 'Whole-sheet placements must be reviewed before moving this page to another edition.';
  end if;

  select coalesce(max(page_row.page_sequence), 0) + 1
  into next_page_sequence
  from public.sanborn_atlas_pages as page_row
  where page_row.atlas_id = destination_atlas_scope.id;

  update public.sanborn_atlas_pages as page_row
  set
    atlas_id = destination_atlas_scope.id,
    page_sequence = next_page_sequence,
    volume_label = destination_atlas_scope.volume_label,
    updated_at = now()
  where page_row.id = source_page_scope.page_row_id;

  update public.sanborn_source_regions as region_row
  set
    atlas_id = destination_atlas_scope.id,
    updated_at = now()
  where region_row.atlas_page_id = source_page_scope.page_row_id;

  return jsonb_build_object(
    'ok', true,
    'pageId', p_page_id,
    'sourceAtlasId', source_page_scope.source_atlas_id,
    'destinationAtlasId', p_destination_atlas_id,
    'pageSequence', next_page_sequence,
    'sourceRegionCount', source_region_count,
    'mapPieceCount', map_piece_count,
    'mapPiecePlacementCount', map_piece_placement_count
  );
end;
$$;

alter table public.sanborn_atlases enable row level security;
alter table public.sanborn_atlas_pages enable row level security;

revoke all on table public.sanborn_atlases from PUBLIC, anon, authenticated;
grant select, insert, update, delete on table public.sanborn_atlases to service_role;

revoke all on table public.sanborn_atlas_pages from PUBLIC, anon, authenticated;
grant select, insert, update, delete on table public.sanborn_atlas_pages to service_role;

revoke execute on function public.archive_sanborn_atlas(uuid, text, text) from PUBLIC, anon, authenticated;
grant execute on function public.archive_sanborn_atlas(uuid, text, text) to service_role;

revoke execute on function public.archive_sanborn_atlas_page(uuid, text, text) from PUBLIC, anon, authenticated;
grant execute on function public.archive_sanborn_atlas_page(uuid, text, text) to service_role;

revoke execute on function public.move_sanborn_atlas_page_to_atlas(uuid, text, text, boolean) from PUBLIC, anon, authenticated;
grant execute on function public.move_sanborn_atlas_page_to_atlas(uuid, text, text, boolean) to service_role;
