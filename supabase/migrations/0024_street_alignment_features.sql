-- PR #97: streets are additive Map Piece alignment guides.
-- Existing IDs, geometry, placements, and review decisions are unchanged.

alter table public.sanborn_map_pieces
  drop constraint if exists sanborn_map_pieces_feature_category_check,
  add constraint sanborn_map_pieces_feature_category_check check (feature_category in (
    'blocks_and_lots', 'wells', 'hydrants', 'water_routes_and_junctions',
    'rail_and_transportation', 'streets_and_intersections', 'detached_or_unusual',
    'printed_notes_and_miscellaneous'
  ));

-- Keep the authoritative 0023 implementation and replace only its allowed-category
-- literals. This preserves its atomic insert/update and draft-omission safeguards.
do $$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.save_sanborn_map_pieces(uuid,text,jsonb)'::regprocedure)
    into function_definition;
  function_definition := replace(
    function_definition,
    '''printed_notes_and_miscellaneous''',
    '''printed_notes_and_miscellaneous'',''streets_and_intersections'''
  );
  execute function_definition;
end;
$$;

comment on column public.sanborn_map_pieces.feature_category is
  'Workflow category; streets_and_intersections is a visual alignment-guide category and is reference-only by default.';
