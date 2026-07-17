create table if not exists public.sanborn_atlases (
  id uuid primary key default gen_random_uuid(),
  atlas_id text not null unique,
  town_package_id uuid not null references public.town_packages(id) on delete cascade,
  source_record_id uuid references public.source_records(id) on delete set null,
  title text not null,
  edition_year integer not null check (edition_year > 0),
  edition_date date,
  volume_label text,
  expected_page_count integer check (expected_page_count is null or expected_page_count > 0),
  review_status review_status_enum not null default 'unknown',
  evidence_classification review_status_enum not null default 'unknown',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_sanborn_atlases_town_edition_volume
on public.sanborn_atlases (town_package_id, edition_year, (coalesce(volume_label, '')));

create index if not exists idx_sanborn_atlases_town_package
on public.sanborn_atlases (town_package_id, edition_year);

create index if not exists idx_sanborn_atlases_source_record
on public.sanborn_atlases (source_record_id);

drop trigger if exists set_sanborn_atlases_updated_at on public.sanborn_atlases;
create trigger set_sanborn_atlases_updated_at
before update on public.sanborn_atlases
for each row
execute function public.set_updated_at();

create table if not exists public.sanborn_atlas_pages (
  id uuid primary key default gen_random_uuid(),
  page_id text not null unique,
  atlas_id uuid not null references public.sanborn_atlases(id) on delete cascade,
  sanborn_sheet_asset_id uuid not null unique references public.sanborn_sheet_assets(id) on delete cascade,
  page_sequence integer not null check (page_sequence > 0),
  page_type text not null default 'unknown' check (
    page_type in (
      'title',
      'legend',
      'graphic_index',
      'street_index',
      'specials_index',
      'numbered_sheet',
      'supplement',
      'unknown'
    )
  ),
  sheet_number integer check (sheet_number is null or sheet_number > 0),
  volume_label text,
  display_label text,
  review_status review_status_enum not null default 'unknown',
  evidence_classification review_status_enum not null default 'unknown',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (atlas_id, page_sequence)
);

create index if not exists idx_sanborn_atlas_pages_atlas
on public.sanborn_atlas_pages (atlas_id, page_sequence);

create index if not exists idx_sanborn_atlas_pages_asset
on public.sanborn_atlas_pages (sanborn_sheet_asset_id);

create index if not exists idx_sanborn_atlas_pages_type
on public.sanborn_atlas_pages (page_type);

drop trigger if exists set_sanborn_atlas_pages_updated_at on public.sanborn_atlas_pages;
create trigger set_sanborn_atlas_pages_updated_at
before update on public.sanborn_atlas_pages
for each row
execute function public.set_updated_at();

create or replace function public.sanborn_source_polygon_is_valid(source_polygon jsonb)
returns boolean
language plpgsql
immutable
security invoker
as $$
declare
  point_count integer;
  point_index integer;
  point jsonb;
  point_x double precision;
  point_y double precision;
  first_x double precision;
  first_y double precision;
  previous_x double precision;
  previous_y double precision;
  area_sum double precision := 0;
  distinct_keys text[] := array[]::text[];
  point_key text;
begin
  if source_polygon is null or jsonb_typeof(source_polygon) <> 'array' then
    return false;
  end if;

  point_count := jsonb_array_length(source_polygon);

  if point_count < 3 then
    return false;
  end if;

  for point_index in 0..(point_count - 1) loop
    point := source_polygon -> point_index;

    if jsonb_typeof(point) <> 'object' or not (point ? 'x') or not (point ? 'y') then
      return false;
    end if;

    begin
      point_x := (point ->> 'x')::double precision;
      point_y := (point ->> 'y')::double precision;
    exception when others then
      return false;
    end;

    if point_x < 0 or point_x > 1 or point_y < 0 or point_y > 1 then
      return false;
    end if;

    point_key := point_x::text || ',' || point_y::text;

    if not (point_key = any(distinct_keys)) then
      distinct_keys := array_append(distinct_keys, point_key);
    end if;

    if point_index = 0 then
      first_x := point_x;
      first_y := point_y;
    else
      area_sum := area_sum + (previous_x * point_y) - (point_x * previous_y);
    end if;

    previous_x := point_x;
    previous_y := point_y;
  end loop;

  if coalesce(array_length(distinct_keys, 1), 0) < 3 then
    return false;
  end if;

  area_sum := area_sum + (previous_x * first_y) - (first_x * previous_y);

  return abs(area_sum) > 0.000000000001;
end;
$$;

create table if not exists public.sanborn_map_pieces (
  id uuid primary key default gen_random_uuid(),
  piece_id text not null unique,
  atlas_page_id uuid not null references public.sanborn_atlas_pages(id) on delete cascade,
  parent_piece_id uuid references public.sanborn_map_pieces(id) on delete set null,
  piece_sequence integer not null check (piece_sequence > 0),
  piece_type text not null default 'unclassified_region' check (
    piece_type in (
      'regular_block',
      'block_fragment',
      'detached_inset',
      'industrial_special',
      'railroad_special',
      'waterfront_special',
      'institutional_special',
      'unclassified_region'
    )
  ),
  block_number_text text,
  title_text text,
  source_polygon jsonb not null check (public.sanborn_source_polygon_is_valid(source_polygon)),
  source_bbox jsonb not null check (jsonb_typeof(source_bbox) = 'object'),
  creation_method text not null default 'human' check (
    creation_method in ('human', 'computer_vision_candidate', 'ocr_assisted', 'import')
  ),
  inventory_status text not null default 'draft' check (
    inventory_status in ('draft', 'reviewed', 'rejected')
  ),
  review_status review_status_enum not null default 'unknown',
  evidence_classification review_status_enum not null default 'unknown',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (atlas_page_id, piece_sequence)
);

create index if not exists idx_sanborn_map_pieces_page
on public.sanborn_map_pieces (atlas_page_id, piece_sequence);

create index if not exists idx_sanborn_map_pieces_parent
on public.sanborn_map_pieces (parent_piece_id);

create index if not exists idx_sanborn_map_pieces_type
on public.sanborn_map_pieces (piece_type);

drop trigger if exists set_sanborn_map_pieces_updated_at on public.sanborn_map_pieces;
create trigger set_sanborn_map_pieces_updated_at
before update on public.sanborn_map_pieces
for each row
execute function public.set_updated_at();

create or replace function public.save_sanborn_atlas_pages(
  p_town_package_id uuid,
  p_atlas_id text,
  p_pages jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  atlas record;
  payload_count integer;
  sequence_offset integer;
begin
  if p_town_package_id is null or nullif(trim(p_atlas_id), '') is null then
    raise exception 'Atlas page saves require a town package ID and atlas ID.';
  end if;

  if p_pages is null or jsonb_typeof(p_pages) <> 'array' then
    raise exception 'Atlas page payload must be an array.';
  end if;

  select id, atlas_id, town_package_id
  into atlas
  from public.sanborn_atlases
  where atlas_id = p_atlas_id;

  if not found then
    raise exception 'Sanborn atlas was not found.';
  end if;

  if atlas.town_package_id <> p_town_package_id then
    raise exception 'Atlas ID belongs to another town package.';
  end if;

  drop table if exists pg_temp._sanborn_page_payload;
  create temporary table _sanborn_page_payload (
    ordinality integer not null,
    page_id text,
    asset_id text,
    page_sequence integer,
    page_type text,
    sheet_number integer,
    volume_label text,
    display_label text,
    existing_page_row_id uuid,
    asset_row_id uuid
  ) on commit drop;

  insert into _sanborn_page_payload (
    ordinality,
    page_id,
    asset_id,
    page_sequence,
    page_type,
    sheet_number,
    volume_label,
    display_label
  )
  select
    payload.ordinality::integer,
    nullif(trim(payload.item ->> 'pageId'), ''),
    nullif(trim(payload.item ->> 'assetId'), ''),
    coalesce(nullif(payload.item ->> 'pageSequence', '')::integer, payload.ordinality::integer),
    coalesce(nullif(trim(payload.item ->> 'pageType'), ''), 'unknown'),
    nullif(payload.item ->> 'sheetNumber', '')::integer,
    nullif(trim(payload.item ->> 'volumeLabel'), ''),
    nullif(trim(payload.item ->> 'displayLabel'), '')
  from jsonb_array_elements(p_pages) with ordinality as payload(item, ordinality);

  select count(*) into payload_count from _sanborn_page_payload;

  if exists (select 1 from _sanborn_page_payload where page_id is null) then
    raise exception 'Each atlas page must include a page ID.';
  end if;

  if exists (select 1 from _sanborn_page_payload where asset_id is null) then
    raise exception 'Each atlas page must reference a Sanborn sheet asset.';
  end if;

  if exists (select 1 from _sanborn_page_payload where page_sequence is null or page_sequence <= 0) then
    raise exception 'Atlas page sequences must be positive integers.';
  end if;

  if exists (
    select 1
    from _sanborn_page_payload
    where page_type not in (
      'title',
      'legend',
      'graphic_index',
      'street_index',
      'specials_index',
      'numbered_sheet',
      'supplement',
      'unknown'
    )
  ) then
    raise exception 'Atlas page type is not allowed.';
  end if;

  if exists (select 1 from _sanborn_page_payload group by page_id having count(*) > 1) then
    raise exception 'Atlas page IDs must be unique.';
  end if;

  if exists (select 1 from _sanborn_page_payload group by asset_id having count(*) > 1) then
    raise exception 'Each uploaded Sanborn sheet can appear once in atlas pages.';
  end if;

  if exists (select 1 from _sanborn_page_payload group by page_sequence having count(*) > 1) then
    raise exception 'Atlas page sequences must be unique.';
  end if;

  update _sanborn_page_payload payload
  set existing_page_row_id = page.id
  from public.sanborn_atlas_pages page
  where page.page_id = payload.page_id;

  if exists (
    select 1
    from _sanborn_page_payload payload
    join public.sanborn_atlas_pages page on page.id = payload.existing_page_row_id
    where page.atlas_id <> atlas.id
  ) then
    raise exception 'Page ID belongs to another Sanborn atlas.';
  end if;

  update _sanborn_page_payload payload
  set asset_row_id = asset.id
  from public.sanborn_sheet_assets asset
  where asset.asset_id = payload.asset_id
    and asset.town_package_id = p_town_package_id;

  if exists (select 1 from _sanborn_page_payload where asset_row_id is null) then
    raise exception 'Atlas pages can only reference uploaded sheets in the active town package.';
  end if;

  if exists (
    select 1
    from _sanborn_page_payload payload
    join public.sanborn_atlas_pages page on page.id = payload.existing_page_row_id
    where page.sanborn_sheet_asset_id <> payload.asset_row_id
  ) then
    raise exception 'Existing atlas page IDs cannot be reassigned to a different Sanborn sheet asset.';
  end if;

  if exists (
    select 1
    from _sanborn_page_payload payload
    join public.sanborn_atlas_pages page on page.sanborn_sheet_asset_id = payload.asset_row_id
    where payload.existing_page_row_id is null
      or page.id <> payload.existing_page_row_id
  ) then
    raise exception 'Sanborn sheet asset is already assigned to another atlas page.';
  end if;

  if exists (
    select 1
    from public.sanborn_atlas_pages page
    where page.atlas_id = atlas.id
      and page.page_sequence in (select page_sequence from _sanborn_page_payload)
      and not exists (
        select 1
        from _sanborn_page_payload payload
        where payload.existing_page_row_id = page.id
      )
  ) then
    raise exception 'Atlas page sequence belongs to an omitted page assignment.';
  end if;

  select 1000000 + coalesce(max(page_sequence), 0)
  into sequence_offset
  from public.sanborn_atlas_pages
  where atlas_id = atlas.id;

  update public.sanborn_atlas_pages page
  set page_sequence = sequence_offset + payload.ordinality
  from _sanborn_page_payload payload
  where page.id = payload.existing_page_row_id;

  insert into public.sanborn_atlas_pages (
    page_id,
    atlas_id,
    sanborn_sheet_asset_id,
    page_sequence,
    page_type,
    sheet_number,
    volume_label,
    display_label
  )
  select
    payload.page_id,
    atlas.id,
    payload.asset_row_id,
    payload.page_sequence,
    payload.page_type,
    payload.sheet_number,
    payload.volume_label,
    payload.display_label
  from _sanborn_page_payload payload
  where payload.existing_page_row_id is null;

  update public.sanborn_atlas_pages page
  set
    page_sequence = payload.page_sequence,
    page_type = payload.page_type,
    sheet_number = payload.sheet_number,
    volume_label = payload.volume_label,
    display_label = payload.display_label
  from _sanborn_page_payload payload
  where page.id = payload.existing_page_row_id;

  return jsonb_build_object(
    'ok', true,
    'pageCount', payload_count,
    'pageOmission', 'unchanged'
  );
end;
$$;

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

  if not found then
    raise exception 'Sanborn atlas page was not found.';
  end if;

  if atlas_page.town_package_id <> p_town_package_id then
    raise exception 'Atlas page belongs to another town package.';
  end if;

  if jsonb_array_length(p_pieces) = 0 then
    if exists (
      select 1
      from public.sanborn_map_pieces
      where atlas_page_id = atlas_page.id
        and inventory_status <> 'draft'
    ) then
      raise exception 'Only draft map pieces can be deleted by omission.';
    end if;

    delete from public.sanborn_map_pieces
    where atlas_page_id = atlas_page.id
      and inventory_status = 'draft';

    get diagnostics deleted_count = row_count;

    return jsonb_build_object(
      'ok', true,
      'pieceCount', 0,
      'deletedCount', deleted_count,
      'pieceOmission', 'delete'
    );
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
    creation_method text,
    inventory_status text,
    notes text,
    existing_piece_row_id uuid,
    final_piece_row_id uuid not null default gen_random_uuid(),
    resolved_parent_row_id uuid
  ) on commit drop;

  insert into _sanborn_piece_payload (
    ordinality,
    piece_id,
    parent_piece_id,
    piece_sequence,
    piece_type,
    block_number_text,
    title_text,
    source_polygon,
    source_bbox,
    creation_method,
    inventory_status,
    notes
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
    coalesce(nullif(trim(payload.item ->> 'creationMethod'), ''), 'human'),
    coalesce(nullif(trim(payload.item ->> 'inventoryStatus'), ''), 'draft'),
    nullif(trim(payload.item ->> 'notes'), '')
  from jsonb_array_elements(p_pieces) with ordinality as payload(item, ordinality);

  select count(*) into payload_count from _sanborn_piece_payload;

  if exists (select 1 from _sanborn_piece_payload where piece_id is null) then
    raise exception 'Each map piece must include a piece ID.';
  end if;

  if exists (select 1 from _sanborn_piece_payload where piece_sequence is null or piece_sequence <= 0) then
    raise exception 'Map piece sequences must be positive integers.';
  end if;

  if exists (
    select 1
    from _sanborn_piece_payload
    where piece_type not in (
      'regular_block',
      'block_fragment',
      'detached_inset',
      'industrial_special',
      'railroad_special',
      'waterfront_special',
      'institutional_special',
      'unclassified_region'
    )
  ) then
    raise exception 'Map piece type is not allowed.';
  end if;

  if exists (
    select 1
    from _sanborn_piece_payload
    where creation_method not in ('human', 'computer_vision_candidate', 'ocr_assisted', 'import')
  ) then
    raise exception 'Map piece creation method is not allowed.';
  end if;

  if exists (
    select 1
    from _sanborn_piece_payload
    where inventory_status not in ('draft', 'reviewed', 'rejected')
  ) then
    raise exception 'Map piece inventory status is not allowed.';
  end if;

  if exists (
    select 1
    from _sanborn_piece_payload
    where not public.sanborn_source_polygon_is_valid(source_polygon)
  ) then
    raise exception 'Map piece polygons must have at least three distinct vertices and nonzero area.';
  end if;

  if exists (
    select 1
    from _sanborn_piece_payload
    where source_bbox is null or jsonb_typeof(source_bbox) <> 'object'
  ) then
    raise exception 'Map piece source bounding boxes must be objects.';
  end if;

  if exists (select 1 from _sanborn_piece_payload group by piece_id having count(*) > 1) then
    raise exception 'Map piece IDs must be unique.';
  end if;

  if exists (select 1 from _sanborn_piece_payload group by piece_sequence having count(*) > 1) then
    raise exception 'Map piece sequences must be unique.';
  end if;

  update _sanborn_piece_payload payload
  set
    existing_piece_row_id = piece.id,
    final_piece_row_id = piece.id
  from public.sanborn_map_pieces piece
  where piece.piece_id = payload.piece_id;

  if exists (
    select 1
    from _sanborn_piece_payload payload
    join public.sanborn_map_pieces piece on piece.id = payload.existing_piece_row_id
    where piece.atlas_page_id <> atlas_page.id
  ) then
    raise exception 'Piece ID belongs to another atlas page.';
  end if;

  if exists (
    select 1
    from _sanborn_piece_payload
    where parent_piece_id is not null
      and parent_piece_id = piece_id
  ) then
    raise exception 'Parent piece cannot be the same as the child piece.';
  end if;

  update _sanborn_piece_payload child
  set resolved_parent_row_id = parent.final_piece_row_id
  from _sanborn_piece_payload parent
  where child.parent_piece_id = parent.piece_id;

  if exists (
    select 1
    from _sanborn_piece_payload child
    join public.sanborn_map_pieces parent on parent.piece_id = child.parent_piece_id
    where child.parent_piece_id is not null
      and child.resolved_parent_row_id is null
      and parent.atlas_page_id <> atlas_page.id
  ) then
    raise exception 'Parent piece belongs to another atlas page.';
  end if;

  if exists (
    select 1
    from _sanborn_piece_payload
    where parent_piece_id is not null
      and resolved_parent_row_id is null
  ) then
    raise exception 'Parent piece reference is invalid for the selected atlas page.';
  end if;

  if exists (
    select 1
    from public.sanborn_map_pieces piece
    where piece.atlas_page_id = atlas_page.id
      and piece.inventory_status <> 'draft'
      and not exists (
        select 1
        from _sanborn_piece_payload payload
        where payload.existing_piece_row_id = piece.id
      )
  ) then
    raise exception 'Only draft map pieces can be deleted by omission.';
  end if;

  select 1000000 + coalesce(max(piece_sequence), 0)
  into sequence_offset
  from public.sanborn_map_pieces
  where atlas_page_id = atlas_page.id;

  update public.sanborn_map_pieces piece
  set piece_sequence = sequence_offset + existing_piece.position
  from (
    select id, row_number() over (order by piece_sequence, id) as position
    from public.sanborn_map_pieces
    where atlas_page_id = atlas_page.id
  ) existing_piece
  where piece.id = existing_piece.id;

  delete from public.sanborn_map_pieces piece
  where piece.atlas_page_id = atlas_page.id
    and piece.inventory_status = 'draft'
    and not exists (
      select 1
      from _sanborn_piece_payload payload
      where payload.existing_piece_row_id = piece.id
    );

  get diagnostics deleted_count = row_count;

  insert into public.sanborn_map_pieces (
    id,
    piece_id,
    atlas_page_id,
    parent_piece_id,
    piece_sequence,
    piece_type,
    block_number_text,
    title_text,
    source_polygon,
    source_bbox,
    creation_method,
    inventory_status,
    notes
  )
  select
    payload.final_piece_row_id,
    payload.piece_id,
    atlas_page.id,
    null,
    payload.piece_sequence,
    payload.piece_type,
    payload.block_number_text,
    payload.title_text,
    payload.source_polygon,
    payload.source_bbox,
    payload.creation_method,
    payload.inventory_status,
    payload.notes
  from _sanborn_piece_payload payload
  where payload.existing_piece_row_id is null;

  update public.sanborn_map_pieces piece
  set
    parent_piece_id = payload.resolved_parent_row_id,
    piece_sequence = payload.piece_sequence,
    piece_type = payload.piece_type,
    block_number_text = payload.block_number_text,
    title_text = payload.title_text,
    source_polygon = payload.source_polygon,
    source_bbox = payload.source_bbox,
    creation_method = payload.creation_method,
    inventory_status = payload.inventory_status,
    notes = payload.notes
  from _sanborn_piece_payload payload
  where piece.id = payload.final_piece_row_id;

  return jsonb_build_object(
    'ok', true,
    'pieceCount', payload_count,
    'deletedCount', deleted_count,
    'pieceOmission', 'delete'
  );
end;
$$;

alter table public.sanborn_atlases enable row level security;
alter table public.sanborn_atlas_pages enable row level security;
alter table public.sanborn_map_pieces enable row level security;

revoke all on table public.sanborn_atlases from PUBLIC;
revoke all on table public.sanborn_atlases from anon;
revoke all on table public.sanborn_atlases from authenticated;
grant select, insert, update, delete on table public.sanborn_atlases to service_role;

revoke all on table public.sanborn_atlas_pages from PUBLIC;
revoke all on table public.sanborn_atlas_pages from anon;
revoke all on table public.sanborn_atlas_pages from authenticated;
grant select, insert, update, delete on table public.sanborn_atlas_pages to service_role;

revoke all on table public.sanborn_map_pieces from PUBLIC;
revoke all on table public.sanborn_map_pieces from anon;
revoke all on table public.sanborn_map_pieces from authenticated;
grant select, insert, update, delete on table public.sanborn_map_pieces to service_role;

revoke execute on function public.sanborn_source_polygon_is_valid(jsonb) from PUBLIC;
revoke execute on function public.sanborn_source_polygon_is_valid(jsonb) from anon;
revoke execute on function public.sanborn_source_polygon_is_valid(jsonb) from authenticated;
grant execute on function public.sanborn_source_polygon_is_valid(jsonb) to service_role;

revoke execute on function public.save_sanborn_atlas_pages(uuid, text, jsonb) from PUBLIC;
revoke execute on function public.save_sanborn_atlas_pages(uuid, text, jsonb) from anon;
revoke execute on function public.save_sanborn_atlas_pages(uuid, text, jsonb) from authenticated;
grant execute on function public.save_sanborn_atlas_pages(uuid, text, jsonb) to service_role;

revoke execute on function public.save_sanborn_map_pieces(uuid, text, jsonb) from PUBLIC;
revoke execute on function public.save_sanborn_map_pieces(uuid, text, jsonb) from anon;
revoke execute on function public.save_sanborn_map_pieces(uuid, text, jsonb) from authenticated;
grant execute on function public.save_sanborn_map_pieces(uuid, text, jsonb) to service_role;
