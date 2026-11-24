-- Public competition share page (no auth) + optional cover image.
-- Anon may only execute get_public_competition; no table grants to anon.

alter table public.competitions
  add column if not exists cover_image_url text
    check (cover_image_url is null or char_length(cover_image_url) between 8 and 500);

comment on column public.competitions.cover_image_url is
  'Optional public HTTPS image URL for the shareable competition page.';

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
      'cover_image_url', c.cover_image_url
    ),
    'organization', jsonb_build_object(
      'name', org.name,
      'city', org.city,
      'slug', org.slug
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

comment on function public.get_public_competition(uuid) is
  'Safe public payload for shareable competition pages. No athlete/coach PII.';
