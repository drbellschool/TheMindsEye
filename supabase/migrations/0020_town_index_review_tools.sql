-- 0020_town_index_review_tools
-- Additive Town Index workflow metadata. Existing polygons and provenance remain unchanged.

alter table public.sanborn_source_regions
  add column if not exists display_color text not null default '#b98b57',
  add column if not exists display_opacity numeric not null default 0.55,
  add column if not exists reference_resolution text not null default 'unresolved',
  add column if not exists reference_resolution_note text;

alter table public.sanborn_source_regions
  drop constraint if exists sanborn_source_regions_region_type_allowed;

alter table public.sanborn_source_regions
  add constraint sanborn_source_regions_region_type_allowed check (
    region_type in (
      'town_coverage_diagram',
      'sheet_coverage_region',
      'printed_index',
      'geographic_map_content',
      'street_index_text',
      'block_index_text',
      'legend_key',
      'inset_map',
      'specials',
      'title_or_decoration',
      'notes',
      'other'
    )
  );

alter table public.sanborn_source_regions
  add constraint sanborn_source_regions_display_opacity_valid check (display_opacity >= 0 and display_opacity <= 1),
  add constraint sanborn_source_regions_reference_resolution_allowed check (
    reference_resolution in ('linked', 'missing', 'not_applicable', 'unresolved')
  ),
  add constraint sanborn_source_regions_reference_note_required check (
    reference_resolution not in ('missing', 'not_applicable')
    or nullif(trim(reference_resolution_note), '') is not null
  );

create index if not exists idx_sanborn_source_regions_reference_resolution
on public.sanborn_source_regions (atlas_id, reference_resolution);
