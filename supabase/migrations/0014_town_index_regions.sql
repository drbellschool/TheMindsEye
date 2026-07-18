create or replace function public.sanborn_index_region_polygon_is_valid(p_polygon jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = public
as $$
declare
  point jsonb;
  point_count integer;
  x_value double precision;
  y_value double precision;
  x_points double precision[] := '{}';
  y_points double precision[] := '{}';
  distinct_points text[] := '{}';
  distinct_key text;
  area_sum double precision := 0;
  tolerance double precision := 0.000000000001;
  i integer;
  j integer;
  i_next integer;
  j_next integer;
  left_a double precision;
  left_b double precision;
  right_a double precision;
  right_b double precision;
begin
  if p_polygon is null or jsonb_typeof(p_polygon) <> 'array' or jsonb_array_length(p_polygon) < 3 then
    return false;
  end if;

  for point in select value from jsonb_array_elements(p_polygon)
  loop
    if jsonb_typeof(point) <> 'object' then
      return false;
    end if;

    begin
      x_value := (point ->> 'x')::double precision;
      y_value := (point ->> 'y')::double precision;
    exception when others then
      return false;
    end;

    if x_value::text in ('NaN', 'Infinity', '-Infinity') or y_value::text in ('NaN', 'Infinity', '-Infinity') then
      return false;
    end if;

    if x_value < 0 or x_value > 1 or y_value < 0 or y_value > 1 then
      return false;
    end if;

    distinct_key := round(x_value::numeric, 6)::text || ',' || round(y_value::numeric, 6)::text;

    if array_position(distinct_points, distinct_key) is null then
      distinct_points := array_append(distinct_points, distinct_key);
    end if;

    x_points := array_append(x_points, x_value);
    y_points := array_append(y_points, y_value);
  end loop;

  point_count := array_length(x_points, 1);

  if point_count < 3 or array_length(distinct_points, 1) < 3 then
    return false;
  end if;

  for i in 1..point_count loop
    i_next := case when i = point_count then 1 else i + 1 end;
    area_sum := area_sum + x_points[i] * y_points[i_next] - x_points[i_next] * y_points[i];
  end loop;

  if abs(area_sum) / 2 <= tolerance then
    return false;
  end if;

  if point_count >= 4 then
    for i in 1..point_count loop
      i_next := case when i = point_count then 1 else i + 1 end;

      for j in (i + 1)..point_count loop
        j_next := case when j = point_count then 1 else j + 1 end;

        if i = j or i_next = j or j_next = i then
          continue;
        end if;

        left_a := (x_points[i_next] - x_points[i]) * (y_points[j] - y_points[i]) - (y_points[i_next] - y_points[i]) * (x_points[j] - x_points[i]);
        left_b := (x_points[i_next] - x_points[i]) * (y_points[j_next] - y_points[i]) - (y_points[i_next] - y_points[i]) * (x_points[j_next] - x_points[i]);
        right_a := (x_points[j_next] - x_points[j]) * (y_points[i] - y_points[j]) - (y_points[j_next] - y_points[j]) * (x_points[i] - x_points[j]);
        right_b := (x_points[j_next] - x_points[j]) * (y_points[i_next] - y_points[j]) - (y_points[j_next] - y_points[j]) * (x_points[i_next] - x_points[j]);

        if (
          ((left_a > tolerance and left_b < -tolerance) or (left_a < -tolerance and left_b > tolerance)) and
          ((right_a > tolerance and right_b < -tolerance) or (right_a < -tolerance and right_b > tolerance))
        ) then
          return false;
        end if;
      end loop;
    end loop;
  end if;

  return true;
end;
$$;

create table if not exists public.sanborn_town_index_regions (
  id uuid primary key default gen_random_uuid(),
  region_id text not null unique,
  town_package_id uuid not null references public.town_packages(id) on delete cascade,
  atlas_id uuid not null references public.sanborn_atlases(id) on delete cascade,
  index_atlas_page_id uuid not null references public.sanborn_atlas_pages(id) on delete cascade,
  linked_atlas_page_id uuid references public.sanborn_atlas_pages(id) on delete set null,
  linked_sheet_asset_id uuid references public.sanborn_sheet_assets(id) on delete set null,
  region_label text not null,
  sheet_reference text,
  region_type text not null default 'unknown',
  source_polygon jsonb not null,
  workflow_status text not null default 'not_started',
  progress_status text not null default 'not_started',
  review_status text not null default 'unknown',
  evidence_classification text not null default 'unknown',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sanborn_town_index_regions_region_type_allowed check (
    region_type in ('sheet_region', 'district', 'coverage_area', 'inset', 'index_label', 'unknown')
  ),
  constraint sanborn_town_index_regions_workflow_status_allowed check (
    workflow_status in ('missing', 'not_started', 'started', 'placed', 'reviewed', 'conflict')
  ),
  constraint sanborn_town_index_regions_progress_status_allowed check (
    progress_status in ('missing', 'not_started', 'started', 'placed', 'reviewed', 'conflict')
  ),
  constraint sanborn_town_index_regions_review_status_allowed check (
    review_status in ('unknown', 'needs_evidence', 'in_review', 'approved', 'rejected', 'verified_fact')
  ),
  constraint sanborn_town_index_regions_evidence_classification_allowed check (
    evidence_classification in ('verified_fact', 'source_based_inference', 'illustrative', 'fictional_gameplay', 'unknown', 'rejected')
  ),
  constraint sanborn_town_index_regions_polygon_valid check (
    public.sanborn_index_region_polygon_is_valid(source_polygon)
  )
);

create index if not exists idx_sanborn_town_index_regions_town_atlas
on public.sanborn_town_index_regions (town_package_id, atlas_id);

create index if not exists idx_sanborn_town_index_regions_index_page
on public.sanborn_town_index_regions (index_atlas_page_id);

create index if not exists idx_sanborn_town_index_regions_linked_page
on public.sanborn_town_index_regions (linked_atlas_page_id);

create index if not exists idx_sanborn_town_index_regions_linked_asset
on public.sanborn_town_index_regions (linked_sheet_asset_id);

create index if not exists idx_sanborn_town_index_regions_sheet_reference
on public.sanborn_town_index_regions (atlas_id, sheet_reference);

create or replace function public.save_sanborn_town_index_region(
  p_town_package_id uuid,
  p_atlas_id text,
  p_region jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  atlas_scope record;
  existing_region_scope record;
  saved_region public.sanborn_town_index_regions%rowtype;
  index_page_scope record;
  linked_page_scope record;
  linked_asset_scope record;
  v_region_id text;
  v_index_page_id text;
  v_linked_page_id text;
  v_linked_asset_id text;
  v_region_label text;
  v_sheet_reference text;
  v_region_type text;
  v_workflow_status text;
  v_progress_status text;
  v_notes text;
  v_source_polygon jsonb;
begin
  select atlas_row.id, atlas_row.atlas_id, atlas_row.town_package_id
  into atlas_scope
  from public.sanborn_atlases as atlas_row
  where atlas_row.atlas_id = p_atlas_id
    and atlas_row.town_package_id = p_town_package_id;

  if atlas_scope.id is null then
    raise exception 'Sanborn atlas was not found in the selected town package.';
  end if;

  v_region_id := nullif(trim(p_region ->> 'regionId'), '');
  v_index_page_id := nullif(trim(p_region ->> 'indexAtlasPageId'), '');
  v_linked_page_id := nullif(trim(p_region ->> 'linkedAtlasPageId'), '');
  v_linked_asset_id := nullif(trim(p_region ->> 'linkedSheetAssetId'), '');
  v_region_label := coalesce(nullif(trim(p_region ->> 'regionLabel'), ''), 'Unlabeled index region');
  v_sheet_reference := nullif(trim(p_region ->> 'sheetReference'), '');
  v_region_type := coalesce(nullif(trim(p_region ->> 'regionType'), ''), 'unknown');
  v_workflow_status := coalesce(nullif(trim(p_region ->> 'workflowStatus'), ''), 'not_started');
  v_progress_status := coalesce(nullif(trim(p_region ->> 'progressStatus'), ''), v_workflow_status);
  v_notes := nullif(trim(p_region ->> 'notes'), '');
  v_source_polygon := p_region -> 'sourcePolygon';

  if v_region_id is null then
    raise exception 'Index region ID is required.';
  end if;

  if v_index_page_id is null then
    raise exception 'Index region must reference the designated index page.';
  end if;

  if v_region_type not in ('sheet_region', 'district', 'coverage_area', 'inset', 'index_label', 'unknown') then
    raise exception 'Index region type is not allowed.';
  end if;

  if v_workflow_status not in ('missing', 'not_started', 'started', 'placed', 'reviewed', 'conflict') then
    raise exception 'Index region workflow status is not allowed.';
  end if;

  if v_progress_status not in ('missing', 'not_started', 'started', 'placed', 'reviewed', 'conflict') then
    raise exception 'Index region progress status is not allowed.';
  end if;

  if not public.sanborn_index_region_polygon_is_valid(v_source_polygon) then
    raise exception 'Index region polygon must be a valid normalized, non-self-intersecting polygon.';
  end if;

  select region_row.id, region_row.atlas_id, region_row.town_package_id
  into existing_region_scope
  from public.sanborn_town_index_regions as region_row
  where region_row.region_id = v_region_id;

  if existing_region_scope.id is not null and (
    existing_region_scope.atlas_id <> atlas_scope.id or existing_region_scope.town_package_id <> p_town_package_id
  ) then
    raise exception 'Index region ID belongs to another atlas or town package.';
  end if;

  select page_row.id, page_row.page_id, page_row.atlas_id, page_row.sanborn_sheet_asset_id
  into index_page_scope
  from public.sanborn_atlas_pages as page_row
  where page_row.page_id = v_index_page_id
    and page_row.atlas_id = atlas_scope.id;

  if index_page_scope.id is null then
    raise exception 'Index region page must belong to the selected atlas.';
  end if;

  if v_linked_page_id is not null then
    select page_row.id, page_row.page_id, page_row.atlas_id, page_row.sanborn_sheet_asset_id
    into linked_page_scope
    from public.sanborn_atlas_pages as page_row
    where page_row.page_id = v_linked_page_id
      and page_row.atlas_id = atlas_scope.id;

    if linked_page_scope.id is null then
      raise exception 'Linked atlas page must belong to the selected atlas.';
    end if;
  end if;

  if v_linked_asset_id is not null then
    select
      asset_row.id,
      asset_row.asset_id,
      asset_row.town_package_id,
      asset_page_row.id as atlas_page_row_id
    into linked_asset_scope
    from public.sanborn_sheet_assets as asset_row
    left join public.sanborn_atlas_pages as asset_page_row
      on asset_page_row.sanborn_sheet_asset_id = asset_row.id
      and asset_page_row.atlas_id = atlas_scope.id
    where asset_row.asset_id = v_linked_asset_id
      and asset_row.town_package_id = p_town_package_id;

    if linked_asset_scope.id is null then
      raise exception 'Linked Sanborn sheet asset must belong to the selected town package.';
    end if;

    if linked_asset_scope.atlas_page_row_id is null then
      raise exception 'Linked Sanborn sheet asset must be assigned to the selected atlas.';
    end if;
  end if;

  if linked_page_scope.id is not null and linked_asset_scope.id is not null and linked_page_scope.sanborn_sheet_asset_id <> linked_asset_scope.id then
    raise exception 'Linked atlas page and linked sheet asset refer to different source sheets.';
  end if;

  if existing_region_scope.id is null then
    insert into public.sanborn_town_index_regions (
      region_id,
      town_package_id,
      atlas_id,
      index_atlas_page_id,
      linked_atlas_page_id,
      linked_sheet_asset_id,
      region_label,
      sheet_reference,
      region_type,
      source_polygon,
      workflow_status,
      progress_status,
      notes
    )
    values (
      v_region_id,
      p_town_package_id,
      atlas_scope.id,
      index_page_scope.id,
      linked_page_scope.id,
      linked_asset_scope.id,
      v_region_label,
      v_sheet_reference,
      v_region_type,
      v_source_polygon,
      v_workflow_status,
      v_progress_status,
      v_notes
    )
    returning * into saved_region;
  else
    update public.sanborn_town_index_regions as region_row
    set
      index_atlas_page_id = index_page_scope.id,
      linked_atlas_page_id = linked_page_scope.id,
      linked_sheet_asset_id = linked_asset_scope.id,
      region_label = v_region_label,
      sheet_reference = v_sheet_reference,
      region_type = v_region_type,
      source_polygon = v_source_polygon,
      workflow_status = v_workflow_status,
      progress_status = v_progress_status,
      notes = v_notes,
      updated_at = now()
    where region_row.id = existing_region_scope.id
    returning * into saved_region;
  end if;

  return to_jsonb(saved_region);
end;
$$;

create or replace function public.delete_sanborn_town_index_region(
  p_town_package_id uuid,
  p_atlas_id text,
  p_region_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  atlas_scope record;
  region_scope record;
begin
  select atlas_row.id, atlas_row.atlas_id, atlas_row.town_package_id
  into atlas_scope
  from public.sanborn_atlases as atlas_row
  where atlas_row.atlas_id = p_atlas_id
    and atlas_row.town_package_id = p_town_package_id;

  if atlas_scope.id is null then
    raise exception 'Sanborn atlas was not found in the selected town package.';
  end if;

  select region_row.id, region_row.region_id, region_row.atlas_id, region_row.town_package_id
  into region_scope
  from public.sanborn_town_index_regions as region_row
  where region_row.region_id = p_region_id;

  if region_scope.id is null then
    raise exception 'Index region was not found.';
  end if;

  if region_scope.atlas_id <> atlas_scope.id or region_scope.town_package_id <> p_town_package_id then
    raise exception 'Index region belongs to another atlas or town package.';
  end if;

  delete from public.sanborn_town_index_regions as region_row
  where region_row.id = region_scope.id;

  return jsonb_build_object('ok', true, 'regionId', p_region_id);
end;
$$;

alter table public.sanborn_town_index_regions enable row level security;

revoke all on table public.sanborn_town_index_regions from PUBLIC, anon, authenticated;
grant select, insert, update, delete on table public.sanborn_town_index_regions to service_role;

revoke execute on function public.sanborn_index_region_polygon_is_valid(jsonb) from PUBLIC, anon, authenticated;
grant execute on function public.sanborn_index_region_polygon_is_valid(jsonb) to service_role;

revoke execute on function public.save_sanborn_town_index_region(uuid, text, jsonb) from PUBLIC, anon, authenticated;
grant execute on function public.save_sanborn_town_index_region(uuid, text, jsonb) to service_role;

revoke execute on function public.delete_sanborn_town_index_region(uuid, text, text) from PUBLIC, anon, authenticated;
grant execute on function public.delete_sanborn_town_index_region(uuid, text, text) to service_role;
