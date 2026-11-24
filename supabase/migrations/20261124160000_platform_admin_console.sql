-- Platform Super Admin console: account status, admin RPCs, safer audit payload.

create type public.account_status as enum ('active', 'suspended');

alter table public.profiles
  add column if not exists account_status public.account_status not null default 'active';

create index if not exists profiles_account_status_idx
  on public.profiles (account_status);

comment on column public.profiles.account_status is
  'Platform account gate. Suspended users are blocked at auth + client.';

-- Redact sensitive athlete fields from audit payloads (forward-looking only).
create or replace function public.audit_sanitize_payload(p_table text, p_payload jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  cleaned jsonb := p_payload;
begin
  if p_table = 'athletes' then
    cleaned := cleaned
      - 'birth_date'
      - 'photo_path'
      - 'notes'
      - 'medical_notes'
      - 'document_id'
      - 'curp'
      - 'guardian_phone'
      - 'guardian_email';
  end if;
  if cleaned ? 'before' then
    cleaned := jsonb_set(
      cleaned,
      '{before}',
      public.audit_sanitize_payload(p_table, cleaned -> 'before')
    );
  end if;
  if cleaned ? 'after' then
    cleaned := jsonb_set(
      cleaned,
      '{after}',
      public.audit_sanitize_payload(p_table, cleaned -> 'after')
    );
  end if;
  return cleaned;
end;
$$;

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  payload jsonb;
  target_id text;
begin
  if tg_op = 'DELETE' then
    payload := to_jsonb(old);
    target_id := old.id::text;
  elsif tg_op = 'UPDATE' then
    payload := jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new));
    target_id := new.id::text;
  else
    payload := to_jsonb(new);
    target_id := new.id::text;
  end if;

  payload := public.audit_sanitize_payload(tg_table_name, payload);

  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    target_id,
    jsonb_build_object(
      'module', tg_table_name,
      'result', 'ok',
      'data', payload
    )
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_organizations on public.organizations;
create trigger audit_organizations
  after insert or update or delete on public.organizations
  for each row execute function public.audit_row_change();

drop trigger if exists audit_profiles on public.profiles;
create trigger audit_profiles
  after update on public.profiles
  for each row execute function public.audit_row_change();

-- Signup audit (no passwords / tokens).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text := coalesce(new.raw_user_meta_data ->> 'role', 'coach');
  final_role public.app_role;
begin
  final_role := case
    when requested_role = 'organizer' then 'organizer'::public.app_role
    else 'coach'::public.app_role
  end;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    final_role
  )
  on conflict (id) do nothing;

  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
  values (
    new.id,
    'rpc:signup',
    'profiles',
    new.id::text,
    jsonb_build_object(
      'module', 'auth',
      'result', 'ok',
      'role', final_role
    )
  );

  return new;
end;
$$;

-- Audit logs are append-only for clients.
revoke insert, update, delete on public.audit_logs from authenticated;
grant select on public.audit_logs to authenticated;

create or replace function public.require_platform_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if not public.is_platform_admin() then
    raise exception 'Se requiere administrador de plataforma' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.account_status = 'suspended'
  ) then
    raise exception 'Cuenta suspendida' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.admin_set_profile_role(
  p_user_id uuid,
  p_role public.app_role
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.profiles;
  admin_count integer;
begin
  perform public.require_platform_admin();

  if p_user_id = auth.uid() and p_role <> 'platform_admin' then
    raise exception 'No puedes quitarte el rol de administrador' using errcode = 'P0001';
  end if;

  select * into target from public.profiles where id = p_user_id;
  if not found then
    raise exception 'Usuario no encontrado' using errcode = 'P0002';
  end if;

  if target.role = 'platform_admin' and p_role <> 'platform_admin' then
    select count(*) into admin_count
    from public.profiles
    where role = 'platform_admin' and account_status = 'active';
    if admin_count <= 1 then
      raise exception 'Debe existir al menos un administrador activo' using errcode = 'P0001';
    end if;
  end if;

  update public.profiles
  set role = p_role
  where id = p_user_id
  returning * into target;

  perform public.log_action(
    'rpc:admin_set_profile_role',
    'profiles',
    p_user_id,
    jsonb_build_object('module', 'admin', 'result', 'ok', 'role', p_role)
  );

  return target;
end;
$$;

create or replace function public.admin_set_account_status(
  p_user_id uuid,
  p_status public.account_status,
  p_reason text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.profiles;
  admin_count integer;
begin
  perform public.require_platform_admin();

  if p_user_id = auth.uid() then
    raise exception 'No puedes suspender o modificar el estado de tu propia cuenta'
      using errcode = 'P0001';
  end if;

  select * into target from public.profiles where id = p_user_id;
  if not found then
    raise exception 'Usuario no encontrado' using errcode = 'P0002';
  end if;

  if target.role = 'platform_admin' and p_status = 'suspended' then
    select count(*) into admin_count
    from public.profiles
    where role = 'platform_admin' and account_status = 'active' and id <> p_user_id;
    if admin_count < 1 then
      raise exception 'No puedes suspender al único administrador activo'
        using errcode = 'P0001';
    end if;
  end if;

  update public.profiles
  set account_status = p_status
  where id = p_user_id
  returning * into target;

  -- Block / restore Auth login when possible.
  begin
    if p_status = 'suspended' then
      update auth.users
      set banned_until = 'infinity'::timestamptz
      where id = p_user_id;
    else
      update auth.users
      set banned_until = null
      where id = p_user_id;
    end if;
  exception
    when insufficient_privilege then
      -- Profile gate still applies via client + require_platform_admin checks.
      null;
    when undefined_table then
      null;
  end;

  perform public.log_action(
    case
      when p_status = 'suspended' then 'rpc:admin_suspend_account'
      else 'rpc:admin_reactivate_account'
    end,
    'profiles',
    p_user_id,
    jsonb_build_object(
      'module', 'admin',
      'result', 'ok',
      'status', p_status,
      'reason', nullif(trim(coalesce(p_reason, '')), '')
    )
  );

  return target;
end;
$$;

create or replace function public.admin_dashboard_stats(
  p_from timestamptz default (now() - interval '30 days'),
  p_to timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  perform public.require_platform_admin();

  select jsonb_build_object(
    'totals', jsonb_build_object(
      'users', (select count(*)::int from public.profiles),
      'users_new', (
        select count(*)::int from public.profiles
        where created_at >= p_from and created_at <= p_to
      ),
      'coaches', (select count(*)::int from public.profiles where role = 'coach'),
      'organizers', (select count(*)::int from public.profiles where role = 'organizer'),
      'admins', (select count(*)::int from public.profiles where role = 'platform_admin'),
      'suspended', (
        select count(*)::int from public.profiles where account_status = 'suspended'
      ),
      'organizations', (select count(*)::int from public.organizations),
      'teams', (select count(*)::int from public.teams),
      'athletes', (select count(*)::int from public.athletes),
      'competitions', (select count(*)::int from public.competitions),
      'registrations', (select count(*)::int from public.registrations),
      'exports_total', (select count(*)::int from public.export_jobs),
      'exports_mdb', (
        select count(*)::int from public.export_jobs
        where format = 'mdb_meet_manager'
      ),
      'exports_csv', (
        select count(*)::int from public.export_jobs
        where format = 'csv_generic' or coalesce(format, '') ilike '%csv%'
      ),
      'exports_failed', (
        select count(*)::int from public.export_jobs where status = 'failed'
      ),
      'exports_completed', (
        select count(*)::int from public.export_jobs where status = 'completed'
      )
    ),
    'series', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', d::date,
        'users', coalesce(u.n, 0),
        'registrations', coalesce(r.n, 0),
        'exports', coalesce(e.n, 0)
      ) order by d)
      from generate_series(p_from::date, p_to::date, interval '1 day') as g(d)
      left join lateral (
        select count(*)::int as n from public.profiles p
        where p.created_at::date = g.d
      ) u on true
      left join lateral (
        select count(*)::int as n from public.registrations reg
        where coalesce(reg.submitted_at, reg.created_at)::date = g.d
      ) r on true
      left join lateral (
        select count(*)::int as n from public.export_jobs j
        where j.created_at::date = g.d
      ) e on true
    ), '[]'::jsonb),
    'recent_audit', coalesce((
      select jsonb_agg(row_to_json(x)::jsonb)
      from (
        select
          a.id,
          a.action,
          a.entity,
          a.entity_id,
          a.created_at,
          a.metadata,
          pr.full_name as actor_name,
          pr.email as actor_email
        from public.audit_logs a
        left join public.profiles pr on pr.id = a.actor_id
        order by a.created_at desc
        limit 12
      ) x
    ), '[]'::jsonb),
    'range', jsonb_build_object('from', p_from, 'to', p_to)
  ) into result;

  return result;
end;
$$;

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
        where tm.user_id = p.id and tm.status = 'active'
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

create or replace function public.admin_user_detail(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  perform public.require_platform_admin();

  select jsonb_build_object(
    'profile', jsonb_build_object(
      'id', p.id,
      'email', p.email,
      'full_name', p.full_name,
      'role', p.role,
      'account_status', p.account_status,
      'created_at', p.created_at,
      'updated_at', p.updated_at,
      'last_sign_in_at', u.last_sign_in_at,
      'email_confirmed', u.email_confirmed_at is not null
    ),
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'name', t.name,
        'role', tm.role,
        'status', tm.status
      ) order by t.name)
      from public.team_members tm
      join public.teams t on t.id = tm.team_id
      where tm.user_id = p.id
    ), '[]'::jsonb),
    'organizations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id,
        'name', o.name,
        'role', om.role
      ) order by o.name)
      from public.organization_members om
      join public.organizations o on o.id = om.organization_id
      where om.user_id = p.id
    ), '[]'::jsonb),
    'competitions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'status', c.status,
        'start_date', c.start_date
      ) order by c.start_date desc)
      from public.competitions c
      where c.created_by = p.id
         or exists (
           select 1 from public.organization_members om
           where om.user_id = p.id and om.organization_id = c.organization_id
         )
      limit 50
    ), '[]'::jsonb),
    'recent_actions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'action', a.action,
        'entity', a.entity,
        'entity_id', a.entity_id,
        'created_at', a.created_at,
        'metadata', a.metadata
      ) order by a.created_at desc)
      from (
        select * from public.audit_logs
        where actor_id = p.id
        order by created_at desc
        limit 20
      ) a
    ), '[]'::jsonb)
  )
  into result
  from public.profiles p
  left join auth.users u on u.id = p.id
  where p.id = p_user_id;

  if result is null then
    raise exception 'Usuario no encontrado' using errcode = 'P0002';
  end if;

  return result;
end;
$$;

create or replace function public.admin_system_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_platform_admin();

  return jsonb_build_object(
    'checked_at', now(),
    'supabase', jsonb_build_object(
      'ok', true,
      'detail', 'RPC y base de datos accesibles'
    ),
    'exports', jsonb_build_object(
      'pending', (select count(*)::int from public.export_jobs where status = 'pending'),
      'processing', (select count(*)::int from public.export_jobs where status = 'running'),
      'completed', (select count(*)::int from public.export_jobs where status = 'completed'),
      'failed', (select count(*)::int from public.export_jobs where status = 'failed'),
      'recent_failures', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', j.id,
          'competition_id', j.competition_id,
          'format', j.format,
          'created_at', j.created_at,
          'error_report', j.error_report
        ) order by j.created_at desc)
        from (
          select * from public.export_jobs
          where status = 'failed'
          order by created_at desc
          limit 10
        ) j
      ), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.require_platform_admin() from public;
revoke all on function public.admin_set_profile_role(uuid, public.app_role) from public;
revoke all on function public.admin_set_account_status(uuid, public.account_status, text) from public;
revoke all on function public.admin_dashboard_stats(timestamptz, timestamptz) from public;
revoke all on function public.admin_list_users(text, public.app_role, public.account_status, integer, integer) from public;
revoke all on function public.admin_user_detail(uuid) from public;
revoke all on function public.admin_system_status() from public;

grant execute on function public.require_platform_admin() to authenticated;
grant execute on function public.admin_set_profile_role(uuid, public.app_role) to authenticated;
grant execute on function public.admin_set_account_status(uuid, public.account_status, text) to authenticated;
grant execute on function public.admin_dashboard_stats(timestamptz, timestamptz) to authenticated;
grant execute on function public.admin_list_users(text, public.app_role, public.account_status, integer, integer) to authenticated;
grant execute on function public.admin_user_detail(uuid) to authenticated;
grant execute on function public.admin_system_status() to authenticated;
