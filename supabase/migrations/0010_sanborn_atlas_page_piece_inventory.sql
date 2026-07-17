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
  source_polygon jsonb not null check (
    case
      when jsonb_typeof(source_polygon) = 'array' then jsonb_array_length(source_polygon) >= 3
      else false
    end
  ),
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
