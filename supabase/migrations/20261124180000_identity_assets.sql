-- Institutional identity fields + storage buckets for branding assets.
-- Athlete photos and profile avatars remain private; org/competition assets are public institutional.

-- ---------- organizations ------------------------------------------------------
alter table public.organizations
  add column if not exists trade_name text,
  add column if not exists description text,
  add column if not exists website_url text,
  add column if not exists logo_path text,
  add column if not exists cover_path text,
  add column if not exists contact_phone text,
  add column if not exists social_links jsonb not null default '{}'::jsonb;

alter table public.organizations
  drop constraint if exists organizations_trade_name_len;
alter table public.organizations
  add constraint organizations_trade_name_len
  check (trade_name is null or char_length(trade_name) between 1 and 160);

alter table public.organizations
  drop constraint if exists organizations_description_len;
alter table public.organizations
  add constraint organizations_description_len
  check (description is null or char_length(description) <= 2000);

alter table public.organizations
  drop constraint if exists organizations_website_url_len;
alter table public.organizations
  add constraint organizations_website_url_len
  check (
    website_url is null
    or (
      char_length(website_url) between 8 and 500
      and website_url ~* '^https?://'
    )
  );

comment on column public.organizations.trade_name is
  'Commercial / brand name shown in institutional contexts; name remains the legal/official label.';
comment on column public.organizations.social_links is
  'Optional public social URLs: {facebook,instagram,x,youtube,tiktok}. Never store secrets.';
comment on column public.organizations.logo_path is
  'Storage path in org-assets bucket (public institutional).';
comment on column public.organizations.cover_path is
  'Storage path in org-assets bucket (public institutional cover 16:9).';

-- ---------- teams --------------------------------------------------------------
alter table public.teams
  add column if not exists description text;

alter table public.teams
  drop constraint if exists teams_description_len;
alter table public.teams
  add constraint teams_description_len
  check (description is null or char_length(description) <= 1000);

-- ---------- profiles (coach / organizer personal branding) ---------------------
alter table public.profiles
  add column if not exists bio text,
  add column if not exists specialty text;

alter table public.profiles
  drop constraint if exists profiles_bio_len;
alter table public.profiles
  add constraint profiles_bio_len
  check (bio is null or char_length(bio) <= 1000);

alter table public.profiles
  drop constraint if exists profiles_specialty_len;
alter table public.profiles
  add constraint profiles_specialty_len
  check (specialty is null or char_length(specialty) <= 120);

comment on column public.profiles.bio is
  'Optional professional bio; private to the account until a future public coach page is authorized.';
comment on column public.profiles.avatar_path is
  'Private storage path in profile-avatars; display via signed URL.';

-- ---------- competitions -------------------------------------------------------
alter table public.competitions
  add column if not exists logo_path text,
  add column if not exists cover_path text;

comment on column public.competitions.logo_path is
  'Storage path in competition-assets (public institutional logo).';
comment on column public.competitions.cover_path is
  'Storage path in competition-assets; cover_image_url may mirror the public HTTPS URL for anon pages.';

-- ---------- storage buckets ----------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'org-assets',
    'org-assets',
    true,
    3145728,
    array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
  ),
  (
    'competition-assets',
    'competition-assets',
    true,
    5242880,
    array['image/png', 'image/jpeg', 'image/webp']
  ),
  (
    'profile-avatars',
    'profile-avatars',
    false,
    2097152,
    array['image/png', 'image/jpeg', 'image/webp']
  )
on conflict (id) do nothing;

-- ---------- storage policies ---------------------------------------------------
-- Org assets: public read (bucket.public); authenticated write for org admins.
drop policy if exists "org assets: admins insert" on storage.objects;
create policy "org assets: admins insert" on storage.objects for insert to authenticated
with check (
  bucket_id = 'org-assets'
  and (
    public.is_platform_admin()
    or public.is_org_admin(((storage.foldername(name))[1])::uuid)
  )
);

drop policy if exists "org assets: admins update" on storage.objects;
create policy "org assets: admins update" on storage.objects for update to authenticated
using (
  bucket_id = 'org-assets'
  and (
    public.is_platform_admin()
    or public.is_org_admin(((storage.foldername(name))[1])::uuid)
  )
);

drop policy if exists "org assets: admins delete" on storage.objects;
create policy "org assets: admins delete" on storage.objects for delete to authenticated
using (
  bucket_id = 'org-assets'
  and (
    public.is_platform_admin()
    or public.is_org_admin(((storage.foldername(name))[1])::uuid)
  )
);

-- Competition assets: organizers write.
drop policy if exists "competition assets: organizers insert" on storage.objects;
create policy "competition assets: organizers insert" on storage.objects for insert to authenticated
with check (
  bucket_id = 'competition-assets'
  and (
    public.is_platform_admin()
    or public.is_competition_organizer(((storage.foldername(name))[1])::uuid)
  )
);

drop policy if exists "competition assets: organizers update" on storage.objects;
create policy "competition assets: organizers update" on storage.objects for update to authenticated
using (
  bucket_id = 'competition-assets'
  and (
    public.is_platform_admin()
    or public.is_competition_organizer(((storage.foldername(name))[1])::uuid)
  )
);

drop policy if exists "competition assets: organizers delete" on storage.objects;
create policy "competition assets: organizers delete" on storage.objects for delete to authenticated
using (
  bucket_id = 'competition-assets'
  and (
    public.is_platform_admin()
    or public.is_competition_organizer(((storage.foldername(name))[1])::uuid)
  )
);

-- Profile avatars: owner-only private bucket.
drop policy if exists "profile avatars: owner select" on storage.objects;
create policy "profile avatars: owner select" on storage.objects for select to authenticated
using (
  bucket_id = 'profile-avatars'
  and (
    public.is_platform_admin()
    or ((storage.foldername(name))[1]) = auth.uid()::text
  )
);

drop policy if exists "profile avatars: owner write" on storage.objects;
create policy "profile avatars: owner write" on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-avatars'
  and ((storage.foldername(name))[1]) = auth.uid()::text
);

drop policy if exists "profile avatars: owner update" on storage.objects;
create policy "profile avatars: owner update" on storage.objects for update to authenticated
using (
  bucket_id = 'profile-avatars'
  and ((storage.foldername(name))[1]) = auth.uid()::text
);

drop policy if exists "profile avatars: owner delete" on storage.objects;
create policy "profile avatars: owner delete" on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-avatars'
  and (
    public.is_platform_admin()
    or ((storage.foldername(name))[1]) = auth.uid()::text
  )
);

-- Close gaps on existing private buckets.
drop policy if exists "team logos: owners delete" on storage.objects;
create policy "team logos: owners delete" on storage.objects for delete to authenticated
using (
  bucket_id = 'team-logos'
  and (
    public.is_platform_admin()
    or public.is_team_owner(((storage.foldername(name))[1])::uuid)
  )
);

-- Platform admins can read private branding assets for support.
drop policy if exists "team logos: platform admin read" on storage.objects;
create policy "team logos: platform admin read" on storage.objects for select to authenticated
using (bucket_id = 'team-logos' and public.is_platform_admin());

drop policy if exists "athlete photos: platform admin read" on storage.objects;
create policy "athlete photos: platform admin read" on storage.objects for select to authenticated
using (bucket_id = 'athlete-photos' and public.is_platform_admin());

-- Public competition payload: institutional branding only (no private contacts/photos).
create or replace function public.get_public_competition(p_competition_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c public.competitions%rowtype;
  org public.organizations%rowtype;
  result jsonb;
begin
  if p_competition_id is null then
    return null;
  end if;

  select * into c
  from public.competitions
  where id = p_competition_id
    and status in ('published', 'closed', 'finished');

  if not found then
    return null;
  end if;

  select * into org from public.organizations where id = c.organization_id;

  result := jsonb_build_object(
    'competition', jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'code', c.code,
      'description', c.description,
      'requirements', c.requirements,
      'start_date', c.start_date,
      'end_date', c.end_date,
      'venue', c.venue,
      'city', c.city,
      'registration_opens_at', c.registration_opens_at,
      'registration_closes_at', c.registration_closes_at,
      'pool_course', c.pool_course,
      'pool_length_m', c.pool_length_m,
      'age_reference_date', c.age_reference_date,
      'max_entries_per_athlete', c.max_entries_per_athlete,
      'allow_no_time', c.allow_no_time,
      'status', c.status,
      'cover_image_url', c.cover_image_url,
      'logo_path', c.logo_path
    ),
    'organization', jsonb_build_object(
      'name', coalesce(nullif(org.trade_name, ''), org.name),
      'official_name', org.name,
      'city', org.city,
      'slug', org.slug,
      'website_url', org.website_url,
      'logo_path', org.logo_path,
      'social_links', coalesce(org.social_links, '{}'::jsonb)
    ),
    'categories', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', cat.id,
          'name', cat.name,
          'code', cat.code,
          'sex', cat.sex,
          'min_age', cat.min_age,
          'max_age', cat.max_age,
          'sort_order', cat.sort_order
        )
        order by cat.sort_order, cat.name
      )
      from public.competition_categories cat
      where cat.competition_id = c.id
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', ce.id,
          'event_number', ce.event_number,
          'sex', ce.sex,
          'is_active', ce.is_active,
          'name', ec.name,
          'distance_m', ec.distance_m,
          'stroke', ec.stroke
        )
        order by ce.sort_order, ce.event_number nulls last
      )
      from public.competition_events ce
      join public.event_catalog ec on ec.id = ce.event_catalog_id
      where ce.competition_id = c.id
        and ce.is_active = true
    ), '[]'::jsonb)
  );

  return result;
end;
$$;

revoke all on function public.get_public_competition(uuid) from public;
grant execute on function public.get_public_competition(uuid) to anon, authenticated, service_role;
