-- PR #88: make the existing map-piece save RPC authoritative for PR #84 feature fields.
-- Migration: additive function replacement only. Existing IDs, source polygons, placements,
-- and non-draft omission behavior remain unchanged.

create or replace function public.save_sanborn_map_pieces(
  p_town_package_id uuid,
  p_page_id text,
  p_pieces jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  atlas_page record;
  payload_count integer;
  deleted_count integer := 0;
  sequence_offset integer;
begin
  if p_town_package_id is null or nullif(trim(p_page_id), '') is null then
    raise exception 'Map piece saves require a town package ID and page ID.';
  end if;

  if p_pieces is null or jsonb_typeof(p_pieces) <> 'array' then
    raise exception 'Map piece payload must be an array.';
  end if;

  select page.id, page.page_id, atlas.town_package_id
  into atlas_page
  from public.sanborn_atlas_pages page
  join public.sanborn_atlases atlas on atlas.id = page.atlas_id
  where page.page_id = p_page_id;

  if not found then raise exception 'Sanborn atlas page was not found.'; end if;
  if atlas_page.town_package_id <> p_town_package_id then raise exception 'Atlas page belongs to another town package.'; end if;

  if jsonb_array_length(p_pieces) = 0 then
    if exists (select 1 from public.sanborn_map_pieces where atlas_page_id = atlas_page.id and inventory_status <> 'draft') then
      raise exception 'Only draft map pieces can be deleted by omission.';
    end if;
    delete from public.sanborn_map_pieces where atlas_page_id = atlas_page.id and inventory_status = 'draft';
    get diagnostics deleted_count = row_count;
    return jsonb_build_object('ok', true, 'pieceCount', 0, 'deletedCount', deleted_count, 'pieceOmission', 'delete');
  end if;

  drop table if exists pg_temp._sanborn_piece_payload;
  create temporary table _sanborn_piece_payload (
    ordinality integer not null,
    piece_id text,
    parent_piece_id text,
    piece_sequence integer,
    piece_type text,
    block_number_text text,
    title_text text,
    source_polygon jsonb,
    source_bbox jsonb,
    geometry_type text,
    source_geometry jsonb,
    feature_category text,
    placement_eligibility text,
    printed_symbol_text text,
    review_categories jsonb,
    creation_method text,
    inventory_status text,
    notes text,
    existing_piece_row_id uuid,
    final_piece_row_id uuid not null default gen_random_uuid(),
    resolved_parent_row_id uuid
  ) on commit drop;

  insert into _sanborn_piece_payload (
    ordinality, piece_id, parent_piece_id, piece_sequence, piece_type, block_number_text, title_text,
    source_polygon, source_bbox, geometry_type, source_geometry, feature_category, placement_eligibility,
    printed_symbol_text, review_categories, creation_method, inventory_status, notes
  )
  select
    payload.ordinality::integer,
    nullif(trim(payload.item ->> 'pieceId'), ''),
    nullif(trim(payload.item ->> 'parentPieceId'), ''),
    coalesce(nullif(payload.item ->> 'pieceSequence', '')::integer, payload.ordinality::integer),
    coalesce(nullif(trim(payload.item ->> 'pieceType'), ''), 'unclassified_region'),
    nullif(trim(payload.item ->> 'blockNumberText'), ''),
    nullif(trim(payload.item ->> 'titleText'), ''),
    payload.item -> 'sourcePolygon',
    payload.item -> 'sourceBBox',
    coalesce(nullif(trim(payload.item ->> 'geometryType'), ''), 'polygon'),
    coalesce(payload.item -> 'sourceGeometry', jsonb_build_object('geometryType', 'polygon', 'points', payload.item -> 'sourcePolygon')),
    coalesce(nullif(trim(payload.item ->> 'featureCategory'), ''), 'blocks_and_lots'),
    coalesce(nullif(trim(payload.item ->> 'placementEligibility'), ''), 'available'),
    nullif(trim(payload.item ->> 'printedSymbolText'), ''),
    coalesce(payload.item -> 'reviewCategories', '{}'::jsonb),
    coalesce(nullif(trim(payload.item ->> 'creationMethod'), ''), 'human'),
    coalesce(nullif(trim(payload.item ->> 'inventoryStatus'), ''), 'draft'),
    nullif(trim(payload.item ->> 'notes'), '')
  from jsonb_array_elements(p_pieces) with ordinality as payload(item, ordinality);

  select count(*) into payload_count from _sanborn_piece_payload;

  if exists (select 1 from _sanborn_piece_payload where piece_id is null) then raise exception 'Each map piece must include a piece ID.'; end if;
  if exists (select 1 from _sanborn_piece_payload where piece_sequence is null or piece_sequence <= 0) then raise exception 'Map piece sequences must be positive integers.'; end if;
  if exists (select 1 from _sanborn_piece_payload where piece_type not in ('regular_block','block_fragment','detached_inset','industrial_special','railroad_special','waterfront_special','institutional_special','unclassified_region')) then raise exception 'Map piece type is not allowed.'; end if;
  if exists (select 1 from _sanborn_piece_payload where creation_method not in ('human','computer_vision_candidate','ocr_assisted','import')) then raise exception 'Map piece creation method is not allowed.'; end if;
  if exists (select 1 from _sanborn_piece_payload where inventory_status not in ('draft','reviewed','rejected')) then raise exception 'Map piece inventory status is not allowed.'; end if;
  if exists (select 1 from _sanborn_piece_payload where geometry_type not in ('point','line','polygon','junction')) then raise exception 'Map piece geometry type is not allowed.'; end if;
  if exists (select 1 from _sanborn_piece_payload where source_geometry ->> 'geometryType' <> geometry_type or not public.sanborn_map_piece_source_geometry_is_valid(source_geometry)) then raise exception 'Map piece source geometry is invalid.'; end if;
  if exists (select 1 from _sanborn_piece_payload where not public.sanborn_source_polygon_is_valid(source_polygon)) then raise exception 'Map piece polygons must have at least three distinct vertices and nonzero area.'; end if;
  if exists (select 1 from _sanborn_piece_payload where source_bbox is null or jsonb_typeof(source_bbox) <> 'object') then raise exception 'Map piece source bounding boxes must be objects.'; end if;
  if exists (select 1 from _sanborn_piece_payload where feature_category not in ('blocks_and_lots','wells','hydrants','water_routes_and_junctions','rail_and_transportation','detached_or_unusual','printed_notes_and_miscellaneous')) then raise exception 'Map piece feature category is not allowed.'; end if;
  if exists (select 1 from _sanborn_piece_payload where placement_eligibility not in ('available','reference_only','unresolved')) then raise exception 'Map piece placement eligibility is not allowed.'; end if;
  if exists (select 1 from _sanborn_piece_payload where jsonb_typeof(review_categories) <> 'object' or exists (select 1 from jsonb_object_keys(review_categories) category where category not in ('blocks_and_lots','wells','hydrants','water_routes_and_junctions','rail_and_transportation','detached_or_unusual','printed_notes_and_miscellaneous'))) then raise exception 'Map piece review categories must be an object with allowed categories.'; end if;
  if exists (select 1 from _sanborn_piece_payload group by piece_id having count(*) > 1) then raise exception 'Map piece IDs must be unique.'; end if;
  if exists (select 1 from _sanborn_piece_payload group by piece_sequence having count(*) > 1) then raise exception 'Map piece sequences must be unique.'; end if;

  update _sanborn_piece_payload payload
  set existing_piece_row_id = piece.id, final_piece_row_id = piece.id
  from public.sanborn_map_pieces piece
  where piece.piece_id = payload.piece_id;

  if exists (select 1 from _sanborn_piece_payload payload join public.sanborn_map_pieces piece on piece.id = payload.existing_piece_row_id where piece.atlas_page_id <> atlas_page.id) then raise exception 'Piece ID belongs to another atlas page.'; end if;
  if exists (select 1 from _sanborn_piece_payload where parent_piece_id is not null and parent_piece_id = piece_id) then raise exception 'Parent piece cannot be the same as the child piece.'; end if;

  update _sanborn_piece_payload child
  set resolved_parent_row_id = parent.final_piece_row_id
  from _sanborn_piece_payload parent
  where child.parent_piece_id = parent.piece_id;

  if exists (select 1 from _sanborn_piece_payload child join public.sanborn_map_pieces parent on parent.piece_id = child.parent_piece_id where child.parent_piece_id is not null and child.resolved_parent_row_id is null and parent.atlas_page_id <> atlas_page.id) then raise exception 'Parent piece belongs to another atlas page.'; end if;
  if exists (select 1 from _sanborn_piece_payload where parent_piece_id is not null and resolved_parent_row_id is null) then raise exception 'Parent piece reference is invalid for the selected atlas page.'; end if;
  if exists (select 1 from public.sanborn_map_pieces piece where piece.atlas_page_id = atlas_page.id and piece.inventory_status <> 'draft' and not exists (select 1 from _sanborn_piece_payload payload where payload.existing_piece_row_id = piece.id)) then raise exception 'Only draft map pieces can be deleted by omission.'; end if;

  select 1000000 + coalesce(max(piece_sequence), 0) into sequence_offset from public.sanborn_map_pieces where atlas_page_id = atlas_page.id;
  update public.sanborn_map_pieces piece set piece_sequence = sequence_offset + existing_piece.position from (select id, row_number() over (order by piece_sequence, id) as position from public.sanborn_map_pieces where atlas_page_id = atlas_page.id) existing_piece where piece.id = existing_piece.id;
  delete from public.sanborn_map_pieces piece where piece.atlas_page_id = atlas_page.id and piece.inventory_status = 'draft' and not exists (select 1 from _sanborn_piece_payload payload where payload.existing_piece_row_id = piece.id);
  get diagnostics deleted_count = row_count;

  insert into public.sanborn_map_pieces (
    id, piece_id, atlas_page_id, parent_piece_id, piece_sequence, piece_type, block_number_text, title_text,
    source_polygon, source_bbox, geometry_type, source_geometry, feature_category, placement_eligibility,
    printed_symbol_text, review_categories, creation_method, inventory_status, notes
  )
  select payload.final_piece_row_id, payload.piece_id, atlas_page.id, payload.resolved_parent_row_id, payload.piece_sequence,
    payload.piece_type, payload.block_number_text, payload.title_text, payload.source_polygon, payload.source_bbox,
    payload.geometry_type, payload.source_geometry, payload.feature_category, payload.placement_eligibility,
    payload.printed_symbol_text, payload.review_categories, payload.creation_method, payload.inventory_status, payload.notes
  from _sanborn_piece_payload payload where payload.existing_piece_row_id is null;

  update public.sanborn_map_pieces piece
  set parent_piece_id = payload.resolved_parent_row_id, piece_sequence = payload.piece_sequence, piece_type = payload.piece_type,
    block_number_text = payload.block_number_text, title_text = payload.title_text, source_polygon = payload.source_polygon,
    source_bbox = payload.source_bbox, geometry_type = payload.geometry_type, source_geometry = payload.source_geometry,
    feature_category = payload.feature_category, placement_eligibility = payload.placement_eligibility,
    printed_symbol_text = payload.printed_symbol_text, review_categories = payload.review_categories,
    creation_method = payload.creation_method, inventory_status = payload.inventory_status, notes = payload.notes
  from _sanborn_piece_payload payload where piece.id = payload.final_piece_row_id;

  return jsonb_build_object('ok', true, 'pieceCount', payload_count, 'deletedCount', deleted_count, 'pieceOmission', 'delete');
end;
$$;

revoke execute on function public.save_sanborn_map_pieces(uuid, text, jsonb) from PUBLIC;
revoke execute on function public.save_sanborn_map_pieces(uuid, text, jsonb) from anon;
revoke execute on function public.save_sanborn_map_pieces(uuid, text, jsonb) from authenticated;
grant execute on function public.save_sanborn_map_pieces(uuid, text, jsonb) to service_role;
