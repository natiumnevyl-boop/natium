-- Filtered, paginated audit listing + stats for Super Admin console.
-- Append-only audit_logs unchanged; classification is read-time only.

create or replace function public.admin_audit_category(p_action text, p_entity text, p_metadata jsonb)
returns text
language sql
immutable
as $$
  select case
    when p_action in (
      'rpc:ops_qa_cleanup',
      'rpc:bootstrap_platform_admin_create',
      'rpc:bootstrap_platform_admin_promote'
    ) then 'maintenance'
    when p_action in (
      'rpc:admin_set_profile_role',
      'rpc:admin_set_account_status',
      'rpc:admin_suspend_account',
      'rpc:admin_reactivate_account',
      'signup',
      'rpc:signup'
    ) then 'security'
    when p_action like 'rpc:admin_%' or coalesce(p_metadata->>'module', '') = 'admin'
      then 'admin'
    when p_entity in (
      'registrations',
      'registration_athletes',
      'registration_entries',
      'competitions',
      'teams',
      'athletes',
      'organizations',
      'export_jobs'
    ) or p_action in (
      'rpc:prepare_export_job',
      'rpc:complete_export_job',
      'rpc:claim_export_job',
      'rpc:fail_export_job'
    ) then 'commercial'
    else 'unclassified'
  end
$$;

create or replace function public.admin_list_audit_logs(
  p_search text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_actor_id uuid default null,
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
  v_total integer;
  v_rows jsonb;
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_category text := nullif(trim(coalesce(p_category, '')), '');
begin
  perform public.require_platform_admin();

  if v_category is not null and v_category not in (
    'all', 'commercial', 'admin', 'security', 'maintenance', 'unclassified'
  ) then
    raise exception 'Categoría inválida' using errcode = '22023';
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
      and (p_actor_id is null or a.actor_id = p_actor_id)
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
  )
  select count(*)::int into v_total from categorized;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  into v_rows
  from (
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
  ) t;

  return jsonb_build_object(
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'rows', v_rows
  );
end;
$$;

create or replace function public.admin_audit_stats(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_category text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_category text := nullif(trim(coalesce(p_category, '')), '');
begin
  perform public.require_platform_admin();

  return (
    with base as (
      select
        a.*,
        public.admin_audit_category(a.action, a.entity, a.metadata) as category,
        coalesce(nullif(a.metadata->>'result', ''), 'ok') as result
      from public.audit_logs a
      where (p_from is null or a.created_at >= p_from)
        and (p_to is null or a.created_at <= p_to)
    ),
    filtered as (
      select *
      from base
      where v_category is null
        or v_category = 'all'
        or category = v_category
    )
    select jsonb_build_object(
      'total', (select count(*)::int from filtered),
      'ok', (select count(*)::int from filtered where result = 'ok'),
      'error', (select count(*)::int from filtered where result <> 'ok'),
      'admin', (select count(*)::int from filtered where category in ('admin', 'security'))
    )
  );
end;
$$;

revoke all on function public.admin_audit_category(text, text, jsonb) from public;
revoke all on function public.admin_list_audit_logs(text, timestamptz, timestamptz, uuid, text, text, text, text, integer, integer) from public;
revoke all on function public.admin_audit_stats(timestamptz, timestamptz, text) from public;

grant execute on function public.admin_list_audit_logs(text, timestamptz, timestamptz, uuid, text, text, text, text, integer, integer) to authenticated;
grant execute on function public.admin_audit_stats(timestamptz, timestamptz, text) to authenticated;
