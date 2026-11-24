-- Fix admin_list_audit_logs: CTEs are statement-local in PL/pgSQL.
-- The previous body counted from CTE "categorized" then selected from it in a
-- second statement, which raised: relation "categorized" does not exist.
-- admin_audit_stats was unaffected (single SQL expression).

create or replace function public.admin_list_audit_logs(
  p_search text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_actor_id text default null,
  p_action text default null,
  p_entity text default null,
  p_result text default null,
  p_category text default null,
  p_limit integer default 15,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 15), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_category text := nullif(trim(coalesce(p_category, '')), '');
  v_actor text := nullif(trim(coalesce(p_actor_id, '')), '');
  v_actor_uuid uuid;
  v_result jsonb;
begin
  perform public.require_platform_admin();

  if v_category is not null and v_category not in (
    'all', 'commercial', 'admin', 'security', 'maintenance', 'unclassified'
  ) then
    raise exception 'Categoría inválida' using errcode = '22023';
  end if;

  if v_actor is not null then
    begin
      v_actor_uuid := v_actor::uuid;
    exception
      when invalid_text_representation then
        raise exception 'Identificador de responsable inválido' using errcode = '22P02';
    end;
  end if;

  with filtered as (
    select
      a.id,
      a.actor_id,
      a.action,
      a.entity,
      a.entity_id,
      a.metadata,
      a.created_at,
      public.admin_audit_category(a.action, a.entity, a.metadata) as category,
      coalesce(nullif(a.metadata->>'result', ''), 'ok') as result,
      p.full_name as actor_name,
      p.email as actor_email
    from public.audit_logs a
    left join public.profiles p on p.id = a.actor_id
    where (p_from is null or a.created_at >= p_from)
      and (p_to is null or a.created_at <= p_to)
      and (v_actor_uuid is null or a.actor_id = v_actor_uuid)
      and (p_action is null or p_action = '' or a.action = p_action)
      and (p_entity is null or p_entity = '' or a.entity = p_entity)
      and (
        p_result is null or p_result = ''
        or coalesce(nullif(a.metadata->>'result', ''), 'ok') = p_result
      )
      and (
        v_search is null
        or a.action ilike '%' || v_search || '%'
        or a.entity ilike '%' || v_search || '%'
        or coalesce(a.entity_id, '') ilike '%' || v_search || '%'
        or coalesce(p.full_name, '') ilike '%' || v_search || '%'
        or coalesce(p.email, '') ilike '%' || v_search || '%'
      )
  ),
  categorized as (
    select *
    from filtered
    where v_category is null
      or v_category = 'all'
      or category = v_category
  ),
  counted as (
    select count(*)::int as total from categorized
  ),
  page as (
    select
      id,
      actor_id,
      action,
      entity,
      entity_id,
      metadata,
      created_at,
      category,
      result,
      actor_name,
      actor_email
    from categorized
    order by created_at desc, id desc
    limit v_limit
    offset v_offset
  )
  select jsonb_build_object(
    'total', (select total from counted),
    'limit', v_limit,
    'offset', v_offset,
    'rows', coalesce(
      (select jsonb_agg(row_to_json(page)::jsonb) from page),
      '[]'::jsonb
    )
  )
  into v_result;

  return v_result;
end;
$$;
