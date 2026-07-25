alter table public.sanborn_source_regions
  add column if not exists source_record_id uuid references public.source_records(id) on delete set null;

create index if not exists idx_sanborn_source_regions_source_record
on public.sanborn_source_regions (source_record_id);

create or replace function public.set_sanborn_source_region_provenance(
  p_town_package_id uuid,
  p_atlas_id text,
  p_source_region_id text,
  p_source_record_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  atlas_scope record;
  region_scope record;
  source_scope record;
  source_record_row_id uuid;
begin
  select id into atlas_scope
  from public.sanborn_atlases
  where atlas_id = p_atlas_id and town_package_id = p_town_package_id;
  if atlas_scope.id is null then raise exception 'Sanborn atlas was not found in the selected town package.'; end if;

  select id, source_region_id into region_scope
  from public.sanborn_source_regions
  where source_region_id = p_source_region_id and atlas_id = atlas_scope.id and town_package_id = p_town_package_id;
  if region_scope.id is null then raise exception 'Source region was not found in the selected atlas.'; end if;

  if nullif(trim(coalesce(p_source_record_id, '')), '') is not null then
    select id into source_record_row_id
    from public.source_records
    where id::text = trim(p_source_record_id) and town_package_id = p_town_package_id;
    if source_record_row_id is null then raise exception 'Source record must belong to the selected town package.'; end if;
  end if;

  update public.sanborn_source_regions
  set source_record_id = source_record_row_id, updated_at = now()
  where id = region_scope.id
  returning id, source_region_id, source_record_id into region_scope;

  return jsonb_build_object('id', region_scope.id, 'source_region_id', region_scope.source_region_id, 'source_record_id', region_scope.source_record_id);
end;
$$;

revoke execute on function public.set_sanborn_source_region_provenance(uuid, text, text, text) from PUBLIC, anon, authenticated;
grant execute on function public.set_sanborn_source_region_provenance(uuid, text, text, text) to service_role;
