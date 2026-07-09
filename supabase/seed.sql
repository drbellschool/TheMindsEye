insert into town_packages (
  id,
  slug,
  name,
  year,
  package_id,
  state_region,
  evidence_start_year,
  evidence_end_year,
  release_state,
  review_status,
  certainty,
  is_verified,
  release_notes
)
values (
  '00000000-0000-0000-0000-000000000001',
  'texarkana',
  'Texarkana',
  1885,
  'texarkana_1885',
  'Texas / Arkansas',
  1880,
  1890,
  'unknown',
  'unknown',
  'medium',
  false,
  'Seeded community data remains review-bound until human verification is complete.'
)
on conflict (package_id) do nothing;

insert into source_records (
  id,
  town_package_id,
  source_id,
  title,
  archive_name,
  source_url,
  rights_note,
  source_date,
  page_reference,
  review_status,
  certainty,
  is_verified,
  ocr_excerpt
)
values (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000001',
  'source_texarkana_1885_sanborn_loc',
  'Sanborn Fire Insurance Map from Texarkana, Bowie County, Texas, October 1885',
  'Library of Congress',
  'https://www.loc.gov/',
  'Reference use only',
  '1885-10-01',
  'Sheet 3',
  'source_based_inference',
  'medium',
  false,
  'Sawmill, livery, and rail-side labels appear in the source excerpt as review candidates.'
)
on conflict (source_id) do nothing;

insert into map_layers (
  id,
  town_package_id,
  layer_id,
  label,
  layer_type,
  sheet_number,
  alignment_scope,
  review_status,
  certainty,
  is_verified,
  notes
)
values (
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000001',
  'map_layer_texarkana_sheet_3',
  'Sheet 3',
  'sanborn_sheet',
  3,
  'local_only',
  'source_based_inference',
  'medium',
  false,
  'Local alignment only; final georeferencing still deferred.'
)
on conflict (layer_id) do nothing;

insert into locations (
  id,
  town_package_id,
  map_layer_id,
  location_id,
  label,
  location_type,
  address_text,
  review_status,
  certainty,
  is_verified,
  notes
)
values (
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000201',
  'location_texarkana_sawmill_block',
  'Sawmill block',
  'building_cluster',
  'Near rail spur',
  'unknown',
  'low',
  false,
  'Anchor location remains under review.'
)
on conflict (location_id) do nothing;

insert into buildings (
  id,
  town_package_id,
  location_id,
  building_id,
  label,
  sheet_reference,
  construction,
  stories,
  review_status,
  certainty,
  is_verified,
  art_state,
  notes
)
values (
  '00000000-0000-0000-0000-000000000401',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000301',
  'building_texarkana_0012',
  'Sawmill footprint review',
  'Sheet 3',
  'wood frame',
  1,
  'source_based_inference',
  'medium',
  false,
  'illustrative',
  'Identity is not verified by default and art remains illustrative.'
)
on conflict (building_id) do nothing;

insert into people (
  id,
  town_package_id,
  location_id,
  person_id,
  display_name,
  occupation,
  review_status,
  certainty,
  is_verified,
  notes
)
values (
  '00000000-0000-0000-0000-000000000501',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000301',
  'person_texarkana_a_bell',
  'A. Bell',
  'candidate',
  'unknown',
  'medium',
  false,
  'Candidate identity only; no merge yet.'
)
on conflict (person_id) do nothing;

insert into businesses (
  id,
  town_package_id,
  location_id,
  business_id,
  display_name,
  business_type,
  review_status,
  certainty,
  is_verified,
  notes
)
values (
  '00000000-0000-0000-0000-000000000601',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000301',
  'business_texarkana_livery',
  'Texarkana Livery',
  'livery / wagon yard',
  'source_based_inference',
  'medium',
  false,
  'Commercial candidate stays separate from person identity review.'
)
on conflict (business_id) do nothing;

insert into claims (
  id,
  town_package_id,
  source_record_id,
  location_id,
  building_id,
  person_id,
  business_id,
  claim_id,
  claim_text,
  claim_type,
  review_status,
  certainty,
  is_verified,
  reasoning_note,
  student_visible,
  teacher_visible
)
values (
  '00000000-0000-0000-0000-000000000701',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000401',
  null,
  '00000000-0000-0000-0000-000000000601',
  'claim_texarkana_1885_0001',
  'The building on Sheet 3 is likely associated with a sawmill operation.',
  'source_based_inference',
  'source_based_inference',
  'medium',
  false,
  'Anchored to map evidence and preserved as an inference, not a verified fact.',
  true,
  true
)
on conflict (claim_id) do nothing;

insert into review_events (
  id,
  town_package_id,
  entity_table,
  entity_id,
  previous_review_status,
  next_review_status,
  certainty,
  is_verified,
  summary,
  reviewer_identifier,
  reviewer_name,
  occurred_at,
  notes
)
values
(
  '00000000-0000-0000-0000-000000000801',
  '00000000-0000-0000-0000-000000000001',
  'map_layers',
  'map_layer_texarkana_sheet_3',
  'unknown',
  'source_based_inference',
  'medium',
  false,
  'Sheet 3 alignment remains local-only until more control points are confirmed.',
  'community_seed_01',
  'Community seed',
  '2026-07-09T08:00:00Z',
  'No final georeferencing yet.'
),
(
  '00000000-0000-0000-0000-000000000802',
  '00000000-0000-0000-0000-000000000001',
  'buildings',
  'building_texarkana_0012',
  'unknown',
  'illustrative',
  'low',
  false,
  'Building art request remains illustrative and separate from the reviewed footprint.',
  'community_seed_01',
  'Community seed',
  '2026-07-09T08:15:00Z',
  'Visual layer only.'
),
(
  '00000000-0000-0000-0000-000000000803',
  '00000000-0000-0000-0000-000000000001',
  'people',
  'person_texarkana_a_bell',
  'unknown',
  'unknown',
  'medium',
  false,
  'Person identity remains unresolved pending duplicate review.',
  'community_seed_01',
  'Community seed',
  '2026-07-09T08:30:00Z',
  'Do not auto-promote candidate identity.'
)
on conflict (id) do nothing;

insert into asset_requests (
  id,
  town_package_id,
  asset_request_id,
  entity_table,
  entity_id,
  asset_type,
  prompt_notes,
  review_status,
  certainty,
  is_verified,
  notes
)
values (
  '00000000-0000-0000-0000-000000000901',
  '00000000-0000-0000-0000-000000000001',
  'asset_request_texarkana_001',
  'buildings',
  'building_texarkana_0012',
  'transparent_building_art',
  'Keep the footprint anchor separate from any art treatment.',
  'illustrative',
  'low',
  false,
  'Asset request stays review-bound and non-authoritative.'
)
on conflict (asset_request_id) do nothing;
