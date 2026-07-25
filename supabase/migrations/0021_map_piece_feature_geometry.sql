-- PR #84: additive feature geometry and review metadata for existing map pieces.
-- Rollback: drop the added columns and helper check only after exporting feature metadata;
-- the existing source_polygon and map-piece IDs remain the compatibility surface.

alter table public.sanborn_map_pieces
  add column if not exists geometry_type text not null default 'polygon',
  add column if not exists source_geometry jsonb,
  add column if not exists feature_category text not null default 'blocks_and_lots',
  add column if not exists placement_eligibility text not null default 'available',
  add column if not exists printed_symbol_text text,
  add column if not exists review_categories jsonb not null default '{}'::jsonb;

alter table public.sanborn_atlas_pages
  add column if not exists review_categories jsonb not null default '{}'::jsonb;

alter table public.sanborn_atlas_pages
  drop constraint if exists sanborn_atlas_pages_review_categories_object_check,
  add constraint sanborn_atlas_pages_review_categories_object_check check (jsonb_typeof(review_categories) = 'object');

update public.sanborn_map_pieces
set source_geometry = jsonb_build_object('geometryType', 'polygon', 'points', source_polygon)
where source_geometry is null;

create or replace function public.sanborn_map_piece_source_geometry_is_valid(value jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select jsonb_typeof(value) = 'object'
    and value ->> 'geometryType' in ('point', 'line', 'polygon', 'junction')
    and jsonb_typeof(value -> 'points') = 'array'
    and jsonb_array_length(value -> 'points') >= case when value ->> 'geometryType' in ('point', 'junction') then 1 when value ->> 'geometryType' = 'line' then 2 else 3 end
    and not exists (
      select 1
      from jsonb_array_elements(value -> 'points') as point
      where jsonb_typeof(point) <> 'object'
        or not ((point ->> 'x')::double precision between 0 and 1)
        or not ((point ->> 'y')::double precision between 0 and 1)
    );
$$;

alter table public.sanborn_map_pieces
  alter column source_geometry set not null;

alter table public.sanborn_map_pieces
  drop constraint if exists sanborn_map_pieces_geometry_type_check,
  drop constraint if exists sanborn_map_pieces_feature_category_check,
  drop constraint if exists sanborn_map_pieces_placement_eligibility_check,
  add constraint sanborn_map_pieces_geometry_type_check check (geometry_type in ('point', 'line', 'polygon', 'junction')),
  add constraint sanborn_map_pieces_feature_category_check check (feature_category in ('blocks_and_lots', 'wells', 'hydrants', 'water_routes_and_junctions', 'rail_and_transportation', 'detached_or_unusual', 'printed_notes_and_miscellaneous')),
  add constraint sanborn_map_pieces_placement_eligibility_check check (placement_eligibility in ('available', 'reference_only', 'unresolved')),
  add constraint sanborn_map_pieces_source_geometry_object_check check (public.sanborn_map_piece_source_geometry_is_valid(source_geometry)),
  add constraint sanborn_map_pieces_review_categories_object_check check (jsonb_typeof(review_categories) = 'object');

create index if not exists idx_sanborn_map_pieces_feature_category
on public.sanborn_map_pieces (atlas_page_id, feature_category, geometry_type);
