-- Root cause: admin_list_users compared team_members.status to 'active',
-- but membership_status enum is pending|approved|rejected|revoked.
-- Account liveness uses profiles.account_status (active|suspended).

create or replace function public.admin_list_users(
  p_search text default null,
  p_role public.app_role default null,
  p_status public.account_status default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  lim integer := greatest(1, least(coalesce(p_limit, 50), 100));
  off integer := greatest(0, coalesce(p_offset, 0));
  total integer;
  rows jsonb;
begin
  perform public.require_platform_admin();

  select count(*)::int into total
  from public.profiles p
  where (p_role is null or p.role = p_role)
    and (p_status is null or p.account_status = p_status)
    and (
      p_search is null
      or length(trim(p_search)) = 0
      or p.full_name ilike '%' || trim(p_search) || '%'
      or p.email ilike '%' || trim(p_search) || '%'
    );

  select coalesce(jsonb_agg(row_to_json(x)::jsonb), '[]'::jsonb)
  into rows
  from (
    select
      p.id,
      p.email,
      p.full_name,
      p.role,
      p.account_status,
      p.created_at,
      p.updated_at,
      u.last_sign_in_at,
      u.email_confirmed_at is not null as email_confirmed,
      (
        select count(*)::int from public.team_members tm
        where tm.user_id = p.id and tm.status = 'approved'
      ) as teams_count,
      (
        select count(*)::int from public.organization_members om
        where om.user_id = p.id
      ) as organizations_count
    from public.profiles p
    left join auth.users u on u.id = p.id
    where (p_role is null or p.role = p_role)
      and (p_status is null or p.account_status = p_status)
      and (
        p_search is null
        or length(trim(p_search)) = 0
        or p.full_name ilike '%' || trim(p_search) || '%'
        or p.email ilike '%' || trim(p_search) || '%'
      )
    order by p.created_at desc
    limit lim offset off
  ) x;

  return jsonb_build_object('total', total, 'rows', rows);
end;
$$;

revoke all on function public.admin_list_users(text, public.app_role, public.account_status, integer, integer) from public;
grant execute on function public.admin_list_users(text, public.app_role, public.account_status, integer, integer) to authenticated;
