-- 0015_page_classification_workflow

alter table public.sanborn_atlas_pages
  add column if not exists printed_reference text,
  add column if not exists is_primary_town_index boolean not null default false,
  add column if not exists classification_notes text;

alter table public.sanborn_atlas_pages
  drop constraint if exists sanborn_atlas_pages_page_type_check;

alter table public.sanborn_atlas_pages
  drop constraint if exists sanborn_atlas_pages_page_type_allowed;

update public.sanborn_atlas_pages
set page_type = case page_type
  when 'title' then 'cover'
  when 'numbered_sheet' then 'sanborn_sheet'
  when 'supplement' then 'other'
  when 'graphic_index' then 'graphic_index'
  when 'street_index' then 'street_index'
  when 'specials_index' then 'specials_index'
  when 'legend' then 'legend'
  when 'advertisement' then 'advertisement'
  when 'cover' then 'cover'
  when 'sanborn_sheet' then 'sanborn_sheet'
  when 'inset' then 'inset'
  when 'other' then 'other'
  else 'unknown'
end;

update public.sanborn_atlas_pages
set printed_reference = sheet_number::text
where printed_reference is null
  and sheet_number is not null
  and page_type in ('sanborn_sheet', 'inset', 'graphic_index', 'street_index', 'specials_index');

with single_graphic_index as (
  select atlas_id, min(id) as page_row_id
  from public.sanborn_atlas_pages
  where page_type = 'graphic_index'
  group by atlas_id
  having count(*) = 1
)
update public.sanborn_atlas_pages as page_row
set is_primary_town_index = true
from single_graphic_index
where page_row.id = single_graphic_index.page_row_id
  and not exists (
    select 1
    from public.sanborn_atlas_pages as existing_primary
    where existing_primary.atlas_id = single_graphic_index.atlas_id
      and existing_primary.is_primary_town_index = true
  );

alter table public.sanborn_atlas_pages
  add constraint sanborn_atlas_pages_page_type_allowed check (
    page_type in (
      'cover',
      'legend',
      'graphic_index',
      'street_index',
      'specials_index',
      'sanborn_sheet',
      'inset',
      'advertisement',
      'other',
      'unknown'
    )
  );

alter table public.sanborn_atlas_pages
  drop constraint if exists sanborn_atlas_pages_primary_index_requires_graphic;

alter table public.sanborn_atlas_pages
  add constraint sanborn_atlas_pages_primary_index_requires_graphic check (
    is_primary_town_index = false or page_type = 'graphic_index'
  );

alter table public.sanborn_atlas_pages
  drop constraint if exists sanborn_atlas_pages_printed_reference_format;

alter table public.sanborn_atlas_pages
  add constraint sanborn_atlas_pages_printed_reference_format check (
    printed_reference is null
    or (
      char_length(printed_reference) <= 80
      and printed_reference !~ '[[:cntrl:]]'
    )
  );

alter table public.sanborn_atlas_pages
  drop constraint if exists sanborn_atlas_pages_classification_notes_length;

alter table public.sanborn_atlas_pages
  add constraint sanborn_atlas_pages_classification_notes_length check (
    classification_notes is null or char_length(classification_notes) <= 1000
  );

create unique index if not exists idx_sanborn_atlas_pages_one_primary_town_index
on public.sanborn_atlas_pages (atlas_id)
where is_primary_town_index = true;

create index if not exists idx_sanborn_atlas_pages_type_primary
on public.sanborn_atlas_pages (atlas_id, page_type, is_primary_town_index);

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
    coalesce(nullif(trim(payload.item ->> 'pageType'), ''), 'unknown'),
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
      'legend',
      'graphic_index',
      'street_index',
      'specials_index',
      'sanborn_sheet',
      'inset',
      'advertisement',
      'other',
      'unknown'
    )
  ) then
    raise exception 'Atlas page type is not allowed.';
  end if;

  if exists (select 1 from _sanborn_page_payload where is_primary_town_index = true and page_type <> 'graphic_index') then
    raise exception 'Only Graphic Index pages can be the primary Town Index.';
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

  if not exists (select 1 from _sanborn_page_payload where is_primary_town_index = true)
    and (select count(*) from _sanborn_page_payload where page_type = 'graphic_index') = 1 then
    update _sanborn_page_payload
    set is_primary_town_index = true
    where page_type = 'graphic_index';
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
    'pageOmission', 'unchanged'
  );
end;
$$;

alter table public.sanborn_atlas_pages enable row level security;

revoke all on table public.sanborn_atlas_pages from PUBLIC, anon, authenticated;
grant select, insert, update, delete on table public.sanborn_atlas_pages to service_role;

revoke execute on function public.save_sanborn_atlas_pages(uuid, text, jsonb) from PUBLIC;
revoke execute on function public.save_sanborn_atlas_pages(uuid, text, jsonb) from anon;
revoke execute on function public.save_sanborn_atlas_pages(uuid, text, jsonb) from authenticated;
grant execute on function public.save_sanborn_atlas_pages(uuid, text, jsonb) to service_role;
