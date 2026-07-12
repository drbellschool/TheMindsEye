insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sanborn-sheets',
  'sanborn-sheets',
  false,
  26214400,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.sanborn_sheet_assets (
  id uuid primary key default gen_random_uuid(),
  asset_id text not null unique,
  town_package_id uuid not null references public.town_packages(id) on delete cascade,
  source_record_id uuid references public.source_records(id) on delete set null,
  map_layer_id uuid references public.map_layers(id) on delete set null,
  sheet_number integer check (sheet_number is null or sheet_number > 0),
  original_filename text not null,
  storage_bucket text not null default 'sanborn-sheets',
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  byte_size bigint not null check (byte_size > 0),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  sha256_checksum text not null check (sha256_checksum ~ '^[a-f0-9]{64}$'),
  source_url text,
  archive_name text,
  rights_note text,
  evidence_classification review_status_enum not null default 'unknown',
  review_status review_status_enum not null default 'unknown',
  is_verified boolean not null default false,
  intake_notes text,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_sanborn_sheet_assets_town_checksum
on public.sanborn_sheet_assets (town_package_id, sha256_checksum);

create index if not exists idx_sanborn_sheet_assets_town_package
on public.sanborn_sheet_assets (town_package_id);

create index if not exists idx_sanborn_sheet_assets_source_record
on public.sanborn_sheet_assets (source_record_id);

create index if not exists idx_sanborn_sheet_assets_map_layer
on public.sanborn_sheet_assets (map_layer_id);

create index if not exists idx_sanborn_sheet_assets_sheet_number
on public.sanborn_sheet_assets (town_package_id, sheet_number);

drop trigger if exists set_sanborn_sheet_assets_updated_at on public.sanborn_sheet_assets;
create trigger set_sanborn_sheet_assets_updated_at
before update on public.sanborn_sheet_assets
for each row
execute function public.set_updated_at();
