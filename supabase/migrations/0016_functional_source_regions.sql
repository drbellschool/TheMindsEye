-- 0016_functional_source_regions

alter table public.sanborn_atlas_pages
  drop constraint if exists sanborn_atlas_pages_primary_index_requires_graphic;

alter table public.sanborn_atlas_pages
  drop constraint if exists sanborn_atlas_pages_primary_index_requires_index_or_mixed;

alter table public.sanborn_atlas_pages
  drop constraint if exists sanborn_atlas_pages_page_type_allowed;

alter table public.sanborn_atlas_pages
  drop constraint if exists sanborn_atlas_pages_page_type_check;

update public.sanborn_atlas_pages
set page_type = case page_type
  when 'title' then 'cover'
  when 'graphic_index' then 'index_or_mixed'
  when 'numbered_sheet' then 'sanborn_sheet'
  when 'specials_index' then 'special_sheet'
  when 'inset' then 'special_sheet'
  when 'supplement' then 'other'
  when 'index_or_mixed' then 'index_or_mixed'
  when 'sanborn_sheet' then 'sanborn_sheet'
  when 'street_index' then 'street_index'
  when 'special_sheet' then 'special_sheet'
  when 'cover' then 'cover'
  when 'legend' then 'legend'
  when 'advertisement' then 'advertisement'
  when 'other' then 'other'
  else 'unknown'
end;

alter table public.sanborn_atlas_pages
  add constraint sanborn_atlas_pages_page_type_allowed check (
    page_type in (
      'cover',
      'index_or_mixed',
      'sanborn_sheet',
      'street_index',
      'special_sheet',
      'legend',
      'advertisement',
      'other',
      'unknown'
    )
  );

alter table public.sanborn_atlas_pages
  add constraint sanborn_atlas_pages_primary_index_requires_index_or_mixed check (
    is_primary_town_index = false or page_type = 'index_or_mixed'
  );

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
  atlas_scope record;
  payload_count integer;
  sequence_offset integer;
begin
  if p_town_package_id is null or nullif(trim(p_atlas_id), '') is null then
    raise exception 'Atlas page saves require a town package ID and atlas ID.';
  end if;

  if p_pages is null or jsonb_typeof(p_pages) <> 'array' then
    raise exception 'Atlas page payload must be an array.';
  end if;

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

  drop table if exists pg_temp._sanborn_page_payload;
  create temporary table _sanborn_page_payload (
    ordinality integer not null,
    page_id text,
    asset_id text,
    page_sequence integer,
    page_type text,
    sheet_number integer,
    printed_reference text,
    volume_label text,
    display_label text,
    is_primary_town_index boolean not null default false,
    classification_notes text,
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
    printed_reference,
    volume_label,
    display_label,
    is_primary_town_index,
    classification_notes
  )
  select
    payload.ordinality::integer,
    nullif(trim(payload.item ->> 'pageId'), ''),
    nullif(trim(payload.item ->> 'assetId'), ''),
    coalesce(nullif(payload.item ->> 'pageSequence', '')::integer, payload.ordinality::integer),
    case coalesce(nullif(trim(payload.item ->> 'pageType'), ''), 'unknown')
      when 'title' then 'cover'
      when 'graphic_index' then 'index_or_mixed'
      when 'numbered_sheet' then 'sanborn_sheet'
      when 'specials_index' then 'special_sheet'
      when 'inset' then 'special_sheet'
      when 'supplement' then 'other'
      else coalesce(nullif(trim(payload.item ->> 'pageType'), ''), 'unknown')
    end,
    nullif(payload.item ->> 'sheetNumber', '')::integer,
    nullif(trim(payload.item ->> 'printedReference'), ''),
    nullif(trim(payload.item ->> 'volumeLabel'), ''),
    nullif(trim(payload.item ->> 'displayLabel'), ''),
    coalesce(nullif(payload.item ->> 'isPrimaryTownIndex', '')::boolean, false),
    nullif(trim(payload.item ->> 'classificationNotes'), '')
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
      'cover',
      'index_or_mixed',
      'sanborn_sheet',
      'street_index',
      'special_sheet',
      'legend',
      'advertisement',
      'other',
      'unknown'
    )
  ) then
    raise exception 'Atlas page type is not allowed.';
  end if;

  if exists (select 1 from _sanborn_page_payload where is_primary_town_index = true and page_type <> 'index_or_mixed') then
    raise exception 'Only Index or mixed pages can be the primary Town Index.';
  end if;

  if exists (
    select 1
    from _sanborn_page_payload
    where printed_reference is not null
      and (
        char_length(printed_reference) > 80
        or printed_reference ~ '[[:cntrl:]]'
      )
  ) then
    raise exception 'Printed reference must be 80 characters or fewer and cannot contain control characters.';
  end if;

  if exists (
    select 1
    from _sanborn_page_payload
    where classification_notes is not null
      and char_length(classification_notes) > 1000
  ) then
    raise exception 'Classification notes must be 1000 characters or fewer.';
  end if;

  if (select count(*) from _sanborn_page_payload where is_primary_town_index = true) > 1 then
    raise exception 'Only one primary Town Index page is allowed per Sanborn atlas.';
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

  update _sanborn_page_payload as payload
  set existing_page_row_id = page_row.id
  from public.sanborn_atlas_pages as page_row
  where page_row.page_id = payload.page_id;

  if exists (
    select 1
    from _sanborn_page_payload as payload
    join public.sanborn_atlas_pages as page_row on page_row.id = payload.existing_page_row_id
    where page_row.atlas_id <> atlas_scope.id
  ) then
    raise exception 'Page ID belongs to another Sanborn atlas.';
  end if;

  update _sanborn_page_payload as payload
  set asset_row_id = asset_row.id
  from public.sanborn_sheet_assets as asset_row
  where asset_row.asset_id = payload.asset_id
    and asset_row.town_package_id = p_town_package_id;

  if exists (select 1 from _sanborn_page_payload where asset_row_id is null) then
    raise exception 'Atlas pages can only reference uploaded sheets in the active town package.';
  end if;

  if exists (
    select 1
    from _sanborn_page_payload as payload
    join public.sanborn_atlas_pages as page_row on page_row.id = payload.existing_page_row_id
    where page_row.sanborn_sheet_asset_id <> payload.asset_row_id
  ) then
    raise exception 'Existing atlas page IDs cannot be reassigned to a different Sanborn sheet asset.';
  end if;

  if exists (
    select 1
    from _sanborn_page_payload as payload
    join public.sanborn_atlas_pages as page_row on page_row.sanborn_sheet_asset_id = payload.asset_row_id
    where payload.existing_page_row_id is null
      or page_row.id <> payload.existing_page_row_id
  ) then
    raise exception 'Sanborn sheet asset is already assigned to another atlas page.';
  end if;

  if exists (
    select 1
    from public.sanborn_atlas_pages as page_row
    where page_row.atlas_id = atlas_scope.id
      and page_row.page_sequence in (select page_sequence from _sanborn_page_payload)
      and not exists (
        select 1
        from _sanborn_page_payload as payload
        where payload.existing_page_row_id = page_row.id
      )
  ) then
    raise exception 'Atlas page sequence belongs to an omitted page assignment.';
  end if;

  select 1000000 + coalesce(max(page_sequence), 0)
  into sequence_offset
  from public.sanborn_atlas_pages
  where atlas_id = atlas_scope.id;

  update public.sanborn_atlas_pages as page_row
  set page_sequence = sequence_offset + payload.ordinality
  from _sanborn_page_payload as payload
  where page_row.id = payload.existing_page_row_id;

  if exists (select 1 from _sanborn_page_payload where is_primary_town_index = true) then
    update public.sanborn_atlas_pages as page_row
    set is_primary_town_index = false
    where page_row.atlas_id = atlas_scope.id
      and not exists (
        select 1
        from _sanborn_page_payload as payload
        where payload.existing_page_row_id = page_row.id
      );
  end if;

  insert into public.sanborn_atlas_pages (
    page_id,
    atlas_id,
    sanborn_sheet_asset_id,
    page_sequence,
    page_type,
    sheet_number,
    printed_reference,
    volume_label,
    display_label,
    is_primary_town_index,
    classification_notes
  )
  select
    payload.page_id,
    atlas_scope.id,
    payload.asset_row_id,
    payload.page_sequence,
    payload.page_type,
    payload.sheet_number,
    payload.printed_reference,
    payload.volume_label,
    payload.display_label,
    payload.is_primary_town_index,
    payload.classification_notes
  from _sanborn_page_payload as payload
  where payload.existing_page_row_id is null;

  update public.sanborn_atlas_pages as page_row
  set
    page_sequence = payload.page_sequence,
    page_type = payload.page_type,
    sheet_number = payload.sheet_number,
    printed_reference = payload.printed_reference,
    volume_label = payload.volume_label,
    display_label = payload.display_label,
    is_primary_town_index = payload.is_primary_town_index,
    classification_notes = payload.classification_notes
  from _sanborn_page_payload as payload
  where page_row.id = payload.existing_page_row_id;

  return jsonb_build_object(
    'ok', true,
    'pageCount', payload_count,
    'primaryTownIndexPageId', (
      select page_id
      from public.sanborn_atlas_pages
      where atlas_id = atlas_scope.id
        and is_primary_town_index = true
      limit 1
    ),
    'primaryAutoDesignated', false,
    'pageOmission', 'unchanged'
  );
end;
$$;

create or replace function public.sanborn_source_region_polygon_is_valid(p_polygon jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = public
as $$
  select public.sanborn_index_region_polygon_is_valid(p_polygon);
$$;

create table if not exists public.sanborn_source_regions (
  id uuid primary key default gen_random_uuid(),
  source_region_id text not null unique,
  town_package_id uuid not null references public.town_packages(id) on delete cascade,
  atlas_id uuid not null references public.sanborn_atlases(id) on delete cascade,
  atlas_page_id uuid not null references public.sanborn_atlas_pages(id) on delete cascade,
  source_asset_id uuid not null references public.sanborn_sheet_assets(id) on delete cascade,
  region_type text not null default 'other',
  region_label text not null,
  normalized_polygon jsonb not null,
  printed_reference text,
  linked_atlas_page_id uuid references public.sanborn_atlas_pages(id) on delete set null,
  linked_sheet_asset_id uuid references public.sanborn_sheet_assets(id) on delete set null,
  include_in_town_index boolean not null default false,
  available_to_map_pieces boolean not null default false,
  workflow_status text not null default 'not_started',
  review_status text not null default 'unknown',
  evidence_classification text not null default 'unknown',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sanborn_source_regions_region_type_allowed check (
    region_type in (
      'town_coverage_diagram',
      'sheet_coverage_region',
      'printed_index',
      'geographic_map_content',
      'street_index_text',
      'block_index_text',
      'legend_key',
      'inset_map',
      'title_or_decoration',
      'notes',
      'other'
    )
  ),
  constraint sanborn_source_regions_status_allowed check (
    workflow_status in ('missing', 'not_started', 'started', 'placed', 'reviewed', 'conflict')
  ),
  constraint sanborn_source_regions_review_status_allowed check (
    review_status in ('unknown', 'needs_evidence', 'in_review', 'approved', 'rejected', 'verified_fact')
  ),
  constraint sanborn_source_regions_evidence_classification_allowed check (
    evidence_classification in ('verified_fact', 'source_based_inference', 'illustrative', 'fictional_gameplay', 'unknown', 'rejected')
  ),
  constraint sanborn_source_regions_polygon_valid check (
    public.sanborn_source_region_polygon_is_valid(normalized_polygon)
  ),
  constraint sanborn_source_regions_map_piece_region_allowed check (
    available_to_map_pieces = false or region_type in ('geographic_map_content', 'inset_map')
  )
);

create index if not exists idx_sanborn_source_regions_town_atlas
on public.sanborn_source_regions (town_package_id, atlas_id);

create index if not exists idx_sanborn_source_regions_page
on public.sanborn_source_regions (atlas_page_id);

create index if not exists idx_sanborn_source_regions_asset
on public.sanborn_source_regions (source_asset_id);

create index if not exists idx_sanborn_source_regions_town_index
on public.sanborn_source_regions (atlas_id, include_in_town_index, region_type);

create index if not exists idx_sanborn_source_regions_map_pieces
on public.sanborn_source_regions (atlas_page_id, available_to_map_pieces);

alter table public.sanborn_town_index_regions
  add column if not exists source_region_id uuid references public.sanborn_source_regions(id) on delete set null;

insert into public.sanborn_source_regions (
  source_region_id,
  town_package_id,
  atlas_id,
  atlas_page_id,
  source_asset_id,
  region_type,
  region_label,
  normalized_polygon,
  printed_reference,
  linked_atlas_page_id,
  linked_sheet_asset_id,
  include_in_town_index,
  available_to_map_pieces,
  workflow_status,
  review_status,
  evidence_classification,
  notes,
  created_at,
  updated_at
)
select
  region_row.region_id,
  region_row.town_package_id,
  region_row.atlas_id,
  region_row.index_atlas_page_id,
  index_page_row.sanborn_sheet_asset_id,
  case region_row.region_type
    when 'index_label' then 'printed_index'
    when 'inset' then 'inset_map'
    else 'sheet_coverage_region'
  end,
  region_row.region_label,
  region_row.source_polygon,
  region_row.sheet_reference,
  region_row.linked_atlas_page_id,
  region_row.linked_sheet_asset_id,
  true,
  false,
  region_row.workflow_status,
  region_row.review_status,
  region_row.evidence_classification,
  case
    when region_row.region_type in ('sheet_region', 'district', 'coverage_area', 'unknown') then region_row.notes
    else concat_ws(E'\n', region_row.notes, 'Migrated from Town Index regions by 0016; review functional region purpose if needed.')
  end,
  region_row.created_at,
  region_row.updated_at
from public.sanborn_town_index_regions as region_row
join public.sanborn_atlas_pages as index_page_row
  on index_page_row.id = region_row.index_atlas_page_id
where public.sanborn_source_region_polygon_is_valid(region_row.source_polygon)
on conflict (source_region_id) do nothing;

update public.sanborn_town_index_regions as region_row
set source_region_id = source_region_row.id
from public.sanborn_source_regions as source_region_row
where source_region_row.source_region_id = region_row.region_id
  and region_row.source_region_id is null;

create or replace function public.save_sanborn_source_region(
  p_town_package_id uuid,
  p_atlas_id text,
  p_region jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  atlas_scope record;
  existing_region_scope record;
  source_page_scope record;
  source_asset_scope record;
  saved_region public.sanborn_source_regions%rowtype;
  v_source_region_id text;
  v_atlas_page_id text;
  v_source_asset_id text;
  v_linked_page_id text;
  v_linked_asset_id text;
  v_region_type text;
  v_region_label text;
  v_printed_reference text;
  v_workflow_status text;
  v_include_in_town_index boolean;
  v_available_to_map_pieces boolean;
  v_notes text;
  v_polygon jsonb;
  v_source_asset_row_id uuid;
  v_linked_page_row_id uuid;
  v_linked_page_asset_row_id uuid;
  v_linked_asset_row_id uuid;
  v_linked_asset_assigned_page_row_id uuid;
begin
  select atlas_row.id, atlas_row.atlas_id, atlas_row.town_package_id
  into atlas_scope
  from public.sanborn_atlases as atlas_row
  where atlas_row.atlas_id = p_atlas_id
    and atlas_row.town_package_id = p_town_package_id;

  if atlas_scope.id is null then
    raise exception 'Sanborn atlas was not found in the selected town package.';
  end if;

  v_source_region_id := coalesce(nullif(trim(p_region ->> 'sourceRegionId'), ''), nullif(trim(p_region ->> 'regionId'), ''));
  v_atlas_page_id := coalesce(nullif(trim(p_region ->> 'atlasPageId'), ''), nullif(trim(p_region ->> 'indexAtlasPageId'), ''));
  v_source_asset_id := coalesce(nullif(trim(p_region ->> 'sourceAssetId'), ''), nullif(trim(p_region ->> 'sourceSheetAssetId'), ''));
  v_linked_page_id := nullif(trim(p_region ->> 'linkedAtlasPageId'), '');
  v_linked_asset_id := nullif(trim(p_region ->> 'linkedSheetAssetId'), '');
  v_region_type := coalesce(nullif(trim(p_region ->> 'regionType'), ''), 'other');
  v_region_label := coalesce(nullif(trim(p_region ->> 'regionLabel'), ''), 'Unlabeled source region');
  v_printed_reference := coalesce(nullif(trim(p_region ->> 'printedReference'), ''), nullif(trim(p_region ->> 'sheetReference'), ''));
  v_workflow_status := coalesce(nullif(trim(p_region ->> 'workflowStatus'), ''), 'not_started');
  v_include_in_town_index := coalesce(nullif(p_region ->> 'includeInTownIndex', '')::boolean, false);
  v_available_to_map_pieces := coalesce(nullif(p_region ->> 'availableToMapPieces', '')::boolean, false);
  v_notes := nullif(trim(p_region ->> 'notes'), '');
  v_polygon := coalesce(p_region -> 'normalizedPolygon', p_region -> 'sourcePolygon');

  if v_source_region_id is null then
    raise exception 'Source region ID is required.';
  end if;

  if v_atlas_page_id is null then
    raise exception 'Source region must reference an atlas page.';
  end if;

  if v_region_type not in (
    'town_coverage_diagram',
    'sheet_coverage_region',
    'printed_index',
    'geographic_map_content',
    'street_index_text',
    'block_index_text',
    'legend_key',
    'inset_map',
    'title_or_decoration',
    'notes',
    'other'
  ) then
    raise exception 'Source region type is not allowed.';
  end if;

  if v_workflow_status not in ('missing', 'not_started', 'started', 'placed', 'reviewed', 'conflict') then
    raise exception 'Source region status is not allowed.';
  end if;

  if v_available_to_map_pieces = true and v_region_type not in ('geographic_map_content', 'inset_map') then
    raise exception 'Only geographic map content or inset map regions can be made available to Map Pieces.';
  end if;

  if not public.sanborn_source_region_polygon_is_valid(v_polygon) then
    raise exception 'Source region polygon must be a valid normalized, non-self-intersecting polygon.';
  end if;

  select page_row.id, page_row.page_id, page_row.atlas_id, page_row.sanborn_sheet_asset_id
  into source_page_scope
  from public.sanborn_atlas_pages as page_row
  where page_row.page_id = v_atlas_page_id
    and page_row.atlas_id = atlas_scope.id;

  if source_page_scope.id is null then
    raise exception 'Source region page must belong to the selected atlas.';
  end if;

  if v_source_asset_id is not null then
    select asset_row.id, asset_row.asset_id, asset_row.town_package_id
    into source_asset_scope
    from public.sanborn_sheet_assets as asset_row
    where asset_row.asset_id = v_source_asset_id
      and asset_row.town_package_id = p_town_package_id;

    if source_asset_scope.id is null then
      raise exception 'Source region asset must belong to the selected town package.';
    end if;

    if source_asset_scope.id <> source_page_scope.sanborn_sheet_asset_id then
      raise exception 'Source region asset must match the selected atlas page.';
    end if;

    v_source_asset_row_id := source_asset_scope.id;
  else
    v_source_asset_row_id := source_page_scope.sanborn_sheet_asset_id;
  end if;

  if v_linked_page_id is not null then
    select page_row.id, page_row.sanborn_sheet_asset_id
    into v_linked_page_row_id, v_linked_page_asset_row_id
    from public.sanborn_atlas_pages as page_row
    where page_row.page_id = v_linked_page_id
      and page_row.atlas_id = atlas_scope.id;

    if v_linked_page_row_id is null then
      raise exception 'Linked atlas page must belong to the selected atlas.';
    end if;
  end if;

  if v_linked_asset_id is not null then
    select
      asset_row.id,
      asset_page_row.id as atlas_page_row_id
    into v_linked_asset_row_id, v_linked_asset_assigned_page_row_id
    from public.sanborn_sheet_assets as asset_row
    left join public.sanborn_atlas_pages as asset_page_row
      on asset_page_row.sanborn_sheet_asset_id = asset_row.id
      and asset_page_row.atlas_id = atlas_scope.id
    where asset_row.asset_id = v_linked_asset_id
      and asset_row.town_package_id = p_town_package_id;

    if v_linked_asset_row_id is null then
      raise exception 'Linked Sanborn sheet asset must belong to the selected town package.';
    end if;

    if v_linked_asset_assigned_page_row_id is null then
      raise exception 'Linked Sanborn sheet asset must be assigned to the selected atlas.';
    end if;
  end if;

  if v_linked_page_row_id is not null and v_linked_asset_row_id is not null and v_linked_page_asset_row_id <> v_linked_asset_row_id then
    raise exception 'Linked atlas page and linked sheet asset refer to different source sheets.';
  end if;

  select region_row.id, region_row.atlas_id, region_row.town_package_id
  into existing_region_scope
  from public.sanborn_source_regions as region_row
  where region_row.source_region_id = v_source_region_id;

  if existing_region_scope.id is not null and (
    existing_region_scope.atlas_id <> atlas_scope.id or existing_region_scope.town_package_id <> p_town_package_id
  ) then
    raise exception 'Source region ID belongs to another atlas or town package.';
  end if;

  if existing_region_scope.id is null then
    insert into public.sanborn_source_regions (
      source_region_id,
      town_package_id,
      atlas_id,
      atlas_page_id,
      source_asset_id,
      region_type,
      region_label,
      normalized_polygon,
      printed_reference,
      linked_atlas_page_id,
      linked_sheet_asset_id,
      include_in_town_index,
      available_to_map_pieces,
      workflow_status,
      notes
    )
    values (
      v_source_region_id,
      p_town_package_id,
      atlas_scope.id,
      source_page_scope.id,
      v_source_asset_row_id,
      v_region_type,
      v_region_label,
      v_polygon,
      v_printed_reference,
      v_linked_page_row_id,
      v_linked_asset_row_id,
      v_include_in_town_index,
      v_available_to_map_pieces,
      v_workflow_status,
      v_notes
    )
    returning * into saved_region;
  else
    update public.sanborn_source_regions as region_row
    set
      atlas_page_id = source_page_scope.id,
      source_asset_id = v_source_asset_row_id,
      region_type = v_region_type,
      region_label = v_region_label,
      normalized_polygon = v_polygon,
      printed_reference = v_printed_reference,
      linked_atlas_page_id = v_linked_page_row_id,
      linked_sheet_asset_id = v_linked_asset_row_id,
      include_in_town_index = v_include_in_town_index,
      available_to_map_pieces = v_available_to_map_pieces,
      workflow_status = v_workflow_status,
      notes = v_notes,
      updated_at = now()
    where region_row.id = existing_region_scope.id
    returning * into saved_region;
  end if;

  return to_jsonb(saved_region);
end;
$$;

create or replace function public.delete_sanborn_source_region(
  p_town_package_id uuid,
  p_atlas_id text,
  p_source_region_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  atlas_scope record;
  region_scope record;
begin
  select atlas_row.id, atlas_row.atlas_id, atlas_row.town_package_id
  into atlas_scope
  from public.sanborn_atlases as atlas_row
  where atlas_row.atlas_id = p_atlas_id
    and atlas_row.town_package_id = p_town_package_id;

  if atlas_scope.id is null then
    raise exception 'Sanborn atlas was not found in the selected town package.';
  end if;

  select region_row.id, region_row.source_region_id, region_row.atlas_id, region_row.town_package_id
  into region_scope
  from public.sanborn_source_regions as region_row
  where region_row.source_region_id = p_source_region_id;

  if region_scope.id is null then
    raise exception 'Source region was not found.';
  end if;

  if region_scope.atlas_id <> atlas_scope.id or region_scope.town_package_id <> p_town_package_id then
    raise exception 'Source region belongs to another atlas or town package.';
  end if;

  delete from public.sanborn_source_regions as region_row
  where region_row.id = region_scope.id;

  return jsonb_build_object('ok', true, 'sourceRegionId', p_source_region_id);
end;
$$;

alter table public.sanborn_source_regions enable row level security;

revoke all on table public.sanborn_source_regions from PUBLIC, anon, authenticated;
grant select, insert, update, delete on table public.sanborn_source_regions to service_role;

revoke execute on function public.sanborn_source_region_polygon_is_valid(jsonb) from PUBLIC, anon, authenticated;
grant execute on function public.sanborn_source_region_polygon_is_valid(jsonb) to service_role;

revoke execute on function public.save_sanborn_atlas_pages(uuid, text, jsonb) from PUBLIC, anon, authenticated;
grant execute on function public.save_sanborn_atlas_pages(uuid, text, jsonb) to service_role;

revoke execute on function public.save_sanborn_source_region(uuid, text, jsonb) from PUBLIC, anon, authenticated;
grant execute on function public.save_sanborn_source_region(uuid, text, jsonb) to service_role;

revoke execute on function public.delete_sanborn_source_region(uuid, text, text) from PUBLIC, anon, authenticated;
grant execute on function public.delete_sanborn_source_region(uuid, text, text) to service_role;
