create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'review_status_enum') then
    create type review_status_enum as enum (
      'verified_fact',
      'source_based_inference',
      'illustrative',
      'fictional_gameplay',
      'unknown',
      'rejected'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'certainty_enum') then
    create type certainty_enum as enum (
      'high',
      'medium',
      'low',
      'fictional',
      'unknown'
    );
  end if;
end
$$;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists town_packages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  year integer not null,
  package_id text not null unique,
  state_region text,
  evidence_start_year integer,
  evidence_end_year integer,
  release_state review_status_enum not null default 'unknown',
  review_status review_status_enum not null default 'unknown',
  certainty certainty_enum not null default 'unknown',
  is_verified boolean not null default false,
  release_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists source_records (
  id uuid primary key default gen_random_uuid(),
  town_package_id uuid not null references town_packages(id) on delete cascade,
  source_id text not null unique,
  title text not null,
  archive_name text,
  source_url text,
  rights_note text,
  source_date date,
  page_reference text,
  review_status review_status_enum not null default 'unknown',
  certainty certainty_enum not null default 'unknown',
  is_verified boolean not null default false,
  ocr_excerpt text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists map_layers (
  id uuid primary key default gen_random_uuid(),
  town_package_id uuid not null references town_packages(id) on delete cascade,
  layer_id text not null unique,
  label text not null,
  layer_type text not null,
  sheet_number integer,
  alignment_scope text not null default 'local_only',
  review_status review_status_enum not null default 'unknown',
  certainty certainty_enum not null default 'unknown',
  is_verified boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  town_package_id uuid not null references town_packages(id) on delete cascade,
  map_layer_id uuid references map_layers(id) on delete set null,
  location_id text not null unique,
  label text not null,
  location_type text not null,
  address_text text,
  review_status review_status_enum not null default 'unknown',
  certainty certainty_enum not null default 'unknown',
  is_verified boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists buildings (
  id uuid primary key default gen_random_uuid(),
  town_package_id uuid not null references town_packages(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  building_id text not null unique,
  label text not null,
  sheet_reference text,
  construction text,
  stories integer,
  review_status review_status_enum not null default 'unknown',
  certainty certainty_enum not null default 'unknown',
  is_verified boolean not null default false,
  art_state review_status_enum not null default 'illustrative',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  town_package_id uuid not null references town_packages(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  person_id text not null unique,
  display_name text not null,
  occupation text,
  review_status review_status_enum not null default 'unknown',
  certainty certainty_enum not null default 'unknown',
  is_verified boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  town_package_id uuid not null references town_packages(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  business_id text not null unique,
  display_name text not null,
  business_type text,
  review_status review_status_enum not null default 'unknown',
  certainty certainty_enum not null default 'unknown',
  is_verified boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists claims (
  id uuid primary key default gen_random_uuid(),
  town_package_id uuid not null references town_packages(id) on delete cascade,
  source_record_id uuid references source_records(id) on delete set null,
  location_id uuid references locations(id) on delete set null,
  building_id uuid references buildings(id) on delete set null,
  person_id uuid references people(id) on delete set null,
  business_id uuid references businesses(id) on delete set null,
  claim_id text not null unique,
  claim_text text not null,
  claim_type review_status_enum not null default 'unknown',
  review_status review_status_enum not null default 'unknown',
  certainty certainty_enum not null default 'unknown',
  is_verified boolean not null default false,
  reasoning_note text,
  student_visible boolean not null default true,
  teacher_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.review_events (
  id uuid primary key default gen_random_uuid(),
  town_package_id uuid not null references town_packages(id) on delete cascade,
  target_table text not null,
  target_id text not null,
  source_record_id uuid references source_records(id) on delete set null,
  action_type text not null default 'status_change',
  previous_review_status review_status_enum,
  next_review_status review_status_enum not null default 'unknown',
  reviewer_identifier text,
  reviewer_name text,
  reviewer_role text,
  certainty certainty_enum not null default 'unknown',
  is_verified boolean not null default false,
  summary text not null,
  review_note text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'review_events' and column_name = 'entity_table'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'review_events' and column_name = 'target_table'
  ) then
    alter table public.review_events rename column entity_table to target_table;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'review_events' and column_name = 'entity_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'review_events' and column_name = 'target_id'
  ) then
    alter table public.review_events rename column entity_id to target_id;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'review_events' and column_name = 'review_status'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'review_events' and column_name = 'next_review_status'
  ) then
    alter table public.review_events rename column review_status to next_review_status;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'review_events' and column_name = 'notes'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'review_events' and column_name = 'review_note'
  ) then
    alter table public.review_events rename column notes to review_note;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'review_events' and column_name = 'entity_table'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'review_events' and column_name = 'target_table'
  ) then
    execute '
      update public.review_events
      set target_table = coalesce(target_table, entity_table)
      where target_table is null and entity_table is not null
    ';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'review_events' and column_name = 'entity_id'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'review_events' and column_name = 'target_id'
  ) then
    execute '
      update public.review_events
      set target_id = coalesce(target_id, entity_id)
      where target_id is null and entity_id is not null
    ';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'review_events' and column_name = 'review_status'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'review_events' and column_name = 'next_review_status'
  ) then
    execute '
      update public.review_events
      set next_review_status = coalesce(next_review_status, review_status)
      where next_review_status is null and review_status is not null
    ';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'review_events' and column_name = 'notes'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'review_events' and column_name = 'review_note'
  ) then
    execute '
      update public.review_events
      set review_note = coalesce(review_note, notes)
      where review_note is null and notes is not null
    ';
  end if;
end
$$;

alter table public.review_events add column if not exists source_record_id uuid references source_records(id) on delete set null;
alter table public.review_events add column if not exists action_type text;
alter table public.review_events add column if not exists previous_review_status review_status_enum;
alter table public.review_events add column if not exists next_review_status review_status_enum;
alter table public.review_events add column if not exists reviewer_identifier text;
alter table public.review_events add column if not exists reviewer_name text;
alter table public.review_events add column if not exists reviewer_role text;
alter table public.review_events add column if not exists review_note text;
alter table public.review_events add column if not exists target_table text;
alter table public.review_events add column if not exists target_id text;
alter table public.review_events add column if not exists occurred_at timestamptz;
alter table public.review_events add column if not exists created_at timestamptz;

update public.review_events
set action_type = coalesce(action_type, 'status_change'),
    next_review_status = coalesce(next_review_status, 'unknown'::review_status_enum),
    occurred_at = coalesce(occurred_at, created_at, now()),
    created_at = coalesce(created_at, occurred_at, now())
where action_type is null
   or next_review_status is null
   or occurred_at is null
   or created_at is null;

alter table public.review_events alter column action_type set default 'status_change';
alter table public.review_events alter column next_review_status set default 'unknown';
alter table public.review_events alter column occurred_at set default now();
alter table public.review_events alter column created_at set default now();

alter table public.review_events alter column target_table set not null;
alter table public.review_events alter column target_id set not null;
alter table public.review_events alter column action_type set not null;
alter table public.review_events alter column next_review_status set not null;
alter table public.review_events alter column certainty set not null;
alter table public.review_events alter column is_verified set not null;
alter table public.review_events alter column summary set not null;
alter table public.review_events alter column occurred_at set not null;
alter table public.review_events alter column created_at set not null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'review_events' and column_name = 'entity_table'
  ) then
    alter table public.review_events drop column entity_table;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'review_events' and column_name = 'entity_id'
  ) then
    alter table public.review_events drop column entity_id;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'review_events' and column_name = 'review_status'
  ) then
    alter table public.review_events drop column review_status;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'review_events' and column_name = 'notes'
  ) then
    alter table public.review_events drop column notes;
  end if;
end
$$;

create table if not exists asset_requests (
  id uuid primary key default gen_random_uuid(),
  town_package_id uuid not null references town_packages(id) on delete cascade,
  asset_request_id text not null unique,
  entity_table text not null,
  entity_id text not null,
  asset_type text not null,
  prompt_notes text,
  review_status review_status_enum not null default 'illustrative',
  certainty certainty_enum not null default 'low',
  is_verified boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_source_records_town_package on source_records (town_package_id);
create index if not exists idx_map_layers_town_package on map_layers (town_package_id);
create index if not exists idx_locations_town_package on locations (town_package_id);
create index if not exists idx_buildings_town_package on buildings (town_package_id);
create index if not exists idx_people_town_package on people (town_package_id);
create index if not exists idx_businesses_town_package on businesses (town_package_id);
create index if not exists idx_claims_town_package on claims (town_package_id);
create index if not exists idx_review_events_town_package on public.review_events (town_package_id);
create index if not exists idx_review_events_next_status on public.review_events (next_review_status);
create index if not exists idx_asset_requests_town_package on asset_requests (town_package_id);

drop trigger if exists set_town_packages_updated_at on town_packages;
create trigger set_town_packages_updated_at
before update on town_packages
for each row
execute function set_updated_at();

drop trigger if exists set_source_records_updated_at on source_records;
create trigger set_source_records_updated_at
before update on source_records
for each row
execute function set_updated_at();

drop trigger if exists set_map_layers_updated_at on map_layers;
create trigger set_map_layers_updated_at
before update on map_layers
for each row
execute function set_updated_at();

drop trigger if exists set_locations_updated_at on locations;
create trigger set_locations_updated_at
before update on locations
for each row
execute function set_updated_at();

drop trigger if exists set_buildings_updated_at on buildings;
create trigger set_buildings_updated_at
before update on buildings
for each row
execute function set_updated_at();

drop trigger if exists set_people_updated_at on people;
create trigger set_people_updated_at
before update on people
for each row
execute function set_updated_at();

drop trigger if exists set_businesses_updated_at on businesses;
create trigger set_businesses_updated_at
before update on businesses
for each row
execute function set_updated_at();

drop trigger if exists set_claims_updated_at on claims;
create trigger set_claims_updated_at
before update on claims
for each row
execute function set_updated_at();

drop trigger if exists set_asset_requests_updated_at on asset_requests;
create trigger set_asset_requests_updated_at
before update on asset_requests
for each row
execute function set_updated_at();
