create or replace function public.restore_sanborn_atlas(
  p_town_package_id uuid,
  p_atlas_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  atlas_scope record;
begin
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

  update public.sanborn_atlases as atlas_row
  set archived_at = null,
      archive_reason = null,
      updated_at = now()
  where atlas_row.id = atlas_scope.id;

  return jsonb_build_object('ok', true, 'atlasId', p_atlas_id, 'restoredAt', now());
end;
$$;

revoke execute on function public.restore_sanborn_atlas(uuid, text) from PUBLIC, anon, authenticated;
grant execute on function public.restore_sanborn_atlas(uuid, text) to service_role;
