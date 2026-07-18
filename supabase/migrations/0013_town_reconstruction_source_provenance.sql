create or replace function public.format_mindseye_source_id(p_source_row_id uuid)
returns text
language sql
immutable
security invoker
set search_path = public
as $$
  select 'SRC-' || upper(substr(replace(p_source_row_id::text, '-', ''), 1, 12));
$$;

create or replace function public.set_source_record_internal_source_id()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.internal_source_id is null or nullif(trim(new.internal_source_id), '') is null then
    new.internal_source_id := public.format_mindseye_source_id(new.id);
  else
    new.internal_source_id := upper(trim(new.internal_source_id));
  end if;

  if new.internal_source_id !~ '^SRC-[0-9A-F]{12}$' then
    raise exception 'Source internal display ID must match SRC-XXXXXXXXXXXX.';
  end if;

  return new;
end;
$$;

alter table public.source_records
  add column if not exists internal_source_id text,
  add column if not exists repository_name text,
  add column if not exists collection_name text,
  add column if not exists repository_external_id text,
  add column if not exists persistent_url text,
  add column if not exists item_page_url text,
  add column if not exists iiif_manifest_url text,
  add column if not exists image_service_url text,
  add column if not exists item_resource_id text,
  add column if not exists town_name text,
  add column if not exists county_name text,
  add column if not exists state_name text,
  add column if not exists edition_year integer,
  add column if not exists sheet_number text,
  add column if not exists map_publisher text,
  add column if not exists publication_date date,
  add column if not exists downloaded_at timestamptz,
  add column if not exists imported_at timestamptz,
  add column if not exists imported_by text,
  add column if not exists rights_statement text,
  add column if not exists rights_url text,
  add column if not exists access_note text,
  add column if not exists access_date date,
  add column if not exists citation_note text,
  add column if not exists source_status text;

update public.source_records
set
  internal_source_id = coalesce(nullif(trim(internal_source_id), ''), public.format_mindseye_source_id(id)),
  repository_name = coalesce(nullif(trim(repository_name), ''), nullif(trim(archive_name), '')),
  persistent_url = coalesce(nullif(trim(persistent_url), ''), nullif(trim(source_url), '')),
  rights_statement = coalesce(nullif(trim(rights_statement), ''), nullif(trim(rights_note), '')),
  imported_at = coalesce(imported_at, created_at),
  source_status = coalesce(nullif(trim(source_status), ''), 'unknown');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'source_records_internal_source_id_format'
      and conrelid = 'public.source_records'::regclass
  ) then
    alter table public.source_records
      add constraint source_records_internal_source_id_format
      check (internal_source_id ~ '^SRC-[0-9A-F]{12}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'source_records_source_status_allowed'
      and conrelid = 'public.source_records'::regclass
  ) then
    alter table public.source_records
      add constraint source_records_source_status_allowed
      check (
        source_status is null or source_status in (
          'unknown',
          'draft',
          'linked',
          'reviewed',
          'archived',
          'missing',
          'conflict'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'source_records_edition_year_positive'
      and conrelid = 'public.source_records'::regclass
  ) then
    alter table public.source_records
      add constraint source_records_edition_year_positive
      check (edition_year is null or edition_year > 0);
  end if;
end
$$;

alter table public.source_records
  alter column internal_source_id set not null,
  alter column source_status set default 'unknown';

create unique index if not exists idx_source_records_internal_source_id
on public.source_records (internal_source_id);

create unique index if not exists idx_source_records_repository_external
on public.source_records (repository_name, collection_name, repository_external_id)
where repository_external_id is not null;

create index if not exists idx_source_records_repository_collection
on public.source_records (repository_name, collection_name);

create index if not exists idx_source_records_town_edition_sheet
on public.source_records (town_package_id, edition_year, sheet_number);

drop trigger if exists set_source_records_internal_source_id on public.source_records;
create trigger set_source_records_internal_source_id
before insert or update of internal_source_id
on public.source_records
for each row
execute function public.set_source_record_internal_source_id();

alter table public.sanborn_atlas_pages
  add column if not exists source_record_id uuid references public.source_records(id) on delete set null,
  add column if not exists workflow_status text;

alter table public.sanborn_map_pieces
  add column if not exists source_record_id uuid references public.source_records(id) on delete set null,
  add column if not exists workflow_status text,
  add column if not exists region_kind text;

update public.sanborn_atlas_pages page
set source_record_id = coalesce(page.source_record_id, asset.source_record_id)
from public.sanborn_sheet_assets asset
where page.sanborn_sheet_asset_id = asset.id
  and page.source_record_id is null
  and asset.source_record_id is not null;

update public.sanborn_map_pieces piece
set source_record_id = coalesce(piece.source_record_id, page.source_record_id)
from public.sanborn_atlas_pages page
where piece.atlas_page_id = page.id
  and piece.source_record_id is null
  and page.source_record_id is not null;

alter table public.buildings
  add column if not exists source_record_id uuid references public.source_records(id) on delete set null;

alter table public.people
  add column if not exists source_record_id uuid references public.source_records(id) on delete set null;

alter table public.businesses
  add column if not exists source_record_id uuid references public.source_records(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sanborn_atlas_pages_workflow_status_allowed'
      and conrelid = 'public.sanborn_atlas_pages'::regclass
  ) then
    alter table public.sanborn_atlas_pages
      add constraint sanborn_atlas_pages_workflow_status_allowed
      check (
        workflow_status is null or workflow_status in (
          'not_started',
          'in_progress',
          'placed',
          'reviewed',
          'conflict',
          'missing'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'sanborn_map_pieces_workflow_status_allowed'
      and conrelid = 'public.sanborn_map_pieces'::regclass
  ) then
    alter table public.sanborn_map_pieces
      add constraint sanborn_map_pieces_workflow_status_allowed
      check (
        workflow_status is null or workflow_status in (
          'not_started',
          'in_progress',
          'placed',
          'reviewed',
          'conflict',
          'missing'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'sanborn_map_pieces_region_kind_allowed'
      and conrelid = 'public.sanborn_map_pieces'::regclass
  ) then
    alter table public.sanborn_map_pieces
      add constraint sanborn_map_pieces_region_kind_allowed
      check (
        region_kind is null or region_kind in (
          'block',
          'district',
          'street_segment',
          'index_region',
          'other_map_region'
        )
      );
  end if;
end
$$;

create index if not exists idx_sanborn_atlas_pages_source_record
on public.sanborn_atlas_pages (source_record_id);

create index if not exists idx_sanborn_atlas_pages_workflow_status
on public.sanborn_atlas_pages (workflow_status);

create index if not exists idx_sanborn_map_pieces_source_record
on public.sanborn_map_pieces (source_record_id);

create index if not exists idx_sanborn_map_pieces_workflow_status
on public.sanborn_map_pieces (workflow_status);

create index if not exists idx_sanborn_map_pieces_region_kind
on public.sanborn_map_pieces (region_kind);

create index if not exists idx_buildings_source_record
on public.buildings (source_record_id);

create index if not exists idx_people_source_record
on public.people (source_record_id);

create index if not exists idx_businesses_source_record
on public.businesses (source_record_id);

revoke execute on function public.format_mindseye_source_id(uuid) from PUBLIC;
revoke execute on function public.format_mindseye_source_id(uuid) from anon;
revoke execute on function public.format_mindseye_source_id(uuid) from authenticated;
grant execute on function public.format_mindseye_source_id(uuid) to service_role;

revoke execute on function public.set_source_record_internal_source_id() from PUBLIC;
revoke execute on function public.set_source_record_internal_source_id() from anon;
revoke execute on function public.set_source_record_internal_source_id() from authenticated;
grant execute on function public.set_source_record_internal_source_id() to service_role;
