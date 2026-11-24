-- Organization member policies queried organization_members from inside their own
-- RLS expression, which Postgres rejects as infinite recursion. Reading a profile
-- (which checks org colleagues) then failed with 42P17 and the app never left the
-- loading screen. Security-definer helpers bypass RLS, same as is_org_member.

create or replace function public.is_org_admin(p_org_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  )
$$;

drop policy org_members_manage on public.organization_members;
create policy org_members_manage on public.organization_members
  for all to authenticated
  using (public.is_platform_admin() or public.is_org_admin(organization_id))
  with check (public.is_platform_admin() or public.is_org_admin(organization_id));

drop policy organizations_update on public.organizations;
create policy organizations_update on public.organizations
  for update to authenticated
  using (public.is_platform_admin() or public.is_org_admin(id));
