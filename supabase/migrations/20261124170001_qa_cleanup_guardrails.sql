-- Additional guard: never allow deleting or suspending the last active platform_admin.
-- Operational QA cleanup is executed separately via audited ops script; this migration
-- only hardens RPCs already present.

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

  -- Protect designated owner email even if another admin exists later.
  if lower(target.email) = 'christiancastellanosmx@gmail.com' then
    raise exception 'La cuenta propietaria de la plataforma está protegida'
      using errcode = 'P0001';
  end if;

  update public.profiles
  set account_status = p_status
  where id = p_user_id
  returning * into target;

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
    when insufficient_privilege then null;
    when undefined_table then null;
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

  if lower(target.email) = 'christiancastellanosmx@gmail.com' and p_role <> 'platform_admin' then
    raise exception 'La cuenta propietaria de la plataforma está protegida'
      using errcode = 'P0001';
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
