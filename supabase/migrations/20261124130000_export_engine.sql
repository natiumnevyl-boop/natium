-- =============================================================================
-- NATIUM Entry — export engine RPCs, job format, storage write for organizers
-- =============================================================================

alter table public.export_jobs
  add column if not exists format text not null default 'csv_generic',
  add column if not exists file_name text,
  add column if not exists summary jsonb not null default '{}'::jsonb;

alter table public.export_jobs
  drop constraint if exists export_jobs_format_check;
alter table public.export_jobs
  add constraint export_jobs_format_check
  check (format in ('csv_generic', 'mdb_meet_manager'));

create or replace function public.export_jobs_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if not (public.is_competition_organizer(new.competition_id) or public.is_platform_admin()) then
      raise exception 'Sin permiso para actualizar la exportación' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_export_jobs_guard on public.export_jobs;
-- Updates go through security definer RPCs; direct client updates stay locked down via RLS.

drop policy if exists export_jobs_update on public.export_jobs;
create policy export_jobs_update on public.export_jobs for update to authenticated
  using (public.is_competition_organizer(competition_id) or public.is_platform_admin())
  with check (public.is_competition_organizer(competition_id) or public.is_platform_admin());

drop policy if exists export_job_items_insert on public.export_job_items;
create policy export_job_items_insert on public.export_job_items for insert to authenticated
  with check (
    exists (
      select 1 from public.export_jobs j
      where j.id = export_job_id
        and (public.is_competition_organizer(j.competition_id) or public.is_platform_admin())
    )
  );

drop policy if exists export_job_items_update on public.export_job_items;
create policy export_job_items_update on public.export_job_items for update to authenticated
  using (
    exists (
      select 1 from public.export_jobs j
      where j.id = export_job_id
        and (public.is_competition_organizer(j.competition_id) or public.is_platform_admin())
    )
  );

drop policy if exists "exports: organizers write" on storage.objects;
create policy "exports: organizers write" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'exports'
    and public.is_competition_organizer(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "exports: organizers update" on storage.objects;
create policy "exports: organizers update" on storage.objects for update to authenticated
  using (
    bucket_id = 'exports'
    and public.is_competition_organizer(((storage.foldername(name))[1])::uuid)
  );

-- Snapshot of accepted registrations for a competition (optional team filter).
create or replace function public.get_competition_export_snapshot(
  p_competition_id uuid,
  p_team_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  comp public.competitions;
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if not (public.is_competition_organizer(p_competition_id) or public.is_platform_admin()) then
    raise exception 'Sin permiso para exportar esta competencia' using errcode = '42501';
  end if;

  select * into comp from public.competitions where id = p_competition_id;
  if comp.id is null then
    raise exception 'Competencia no encontrada' using errcode = 'P0002';
  end if;

  with regs as (
    select r.*
    from public.registrations r
    where r.competition_id = p_competition_id
      and r.status in ('accepted', 'exported')
      and (p_team_id is null or r.team_id = p_team_id)
  ),
  teams as (
    select distinct t.id, t.name, t.short_name, t.code
    from public.teams t
    join regs r on r.team_id = t.id
  ),
  events as (
    select
      ce.id,
      ce.event_number,
      ce.external_code,
      ce.sex,
      ce.is_active,
      ec.distance_m,
      ec.stroke,
      ec.name as event_name
    from public.competition_events ce
    join public.event_catalog ec on ec.id = ce.event_catalog_id
    where ce.competition_id = p_competition_id
      and ce.is_active
  ),
  athletes as (
    select
      a.id,
      a.team_id,
      a.display_id,
      a.first_name,
      a.last_name,
      a.birth_date,
      a.sex,
      ra.registration_id,
      ra.id as registration_athlete_id,
      ra.category_id,
      cc.name as category_name,
      cc.code as category_code
    from public.registration_athletes ra
    join regs r on r.id = ra.registration_id
    join public.athletes a on a.id = ra.athlete_id
    left join public.competition_categories cc on cc.id = ra.category_id
  ),
  entries as (
    select
      re.id,
      re.registration_id,
      re.registration_athlete_id,
      re.competition_event_id,
      re.entry_time_cs,
      re.no_time,
      a.id as athlete_id,
      a.team_id
    from public.registration_entries re
    join regs r on r.id = re.registration_id
    join public.registration_athletes ra on ra.id = re.registration_athlete_id
    join public.athletes a on a.id = ra.athlete_id
  )
  select jsonb_build_object(
    'competition', jsonb_build_object(
      'id', comp.id,
      'name', comp.name,
      'code', comp.code,
      'venue', comp.venue,
      'city', comp.city,
      'start_date', comp.start_date,
      'end_date', comp.end_date,
      'age_reference_date', coalesce(comp.age_reference_date, comp.start_date),
      'pool_course', comp.pool_course,
      'pool_length_m', comp.pool_length_m,
      'allow_no_time', comp.allow_no_time
    ),
    'registrations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'team_id', r.team_id,
        'status', r.status,
        'folio', r.folio,
        'submitted_at', r.submitted_at,
        'updated_at', r.updated_at
      ) order by r.folio)
      from regs r
    ), '[]'::jsonb),
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'name', t.name,
        'short_name', t.short_name,
        'code', t.code
      ) order by t.name)
      from teams t
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'event_number', e.event_number,
        'external_code', e.external_code,
        'sex', e.sex,
        'distance_m', e.distance_m,
        'stroke', e.stroke,
        'name', e.event_name
      ) order by e.event_number nulls last, e.event_name)
      from events e
    ), '[]'::jsonb),
    'athletes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'team_id', a.team_id,
        'display_id', a.display_id,
        'first_name', a.first_name,
        'last_name', a.last_name,
        'birth_date', a.birth_date,
        'sex', a.sex,
        'registration_id', a.registration_id,
        'registration_athlete_id', a.registration_athlete_id,
        'category_id', a.category_id,
        'category_name', a.category_name,
        'category_code', a.category_code
      ) order by a.last_name, a.first_name)
      from athletes a
    ), '[]'::jsonb),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'registration_id', e.registration_id,
        'registration_athlete_id', e.registration_athlete_id,
        'competition_event_id', e.competition_event_id,
        'athlete_id', e.athlete_id,
        'team_id', e.team_id,
        'entry_time_cs', e.entry_time_cs,
        'no_time', e.no_time
      ))
      from entries e
    ), '[]'::jsonb)
  ) into result;

  return result;
end $$;

create or replace function public.prepare_export_job(
  p_competition_id uuid,
  p_format text,
  p_team_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  snap jsonb;
  job public.export_jobs;
  reg_ids uuid[];
  next_version integer;
  team_count integer;
  athlete_count integer;
  entry_count integer;
  errors jsonb := '[]'::jsonb;
  issue jsonb;
  rid uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if p_format not in ('csv_generic', 'mdb_meet_manager') then
    raise exception 'Formato de exportación no soportado' using errcode = 'check_violation';
  end if;
  if not (public.is_competition_organizer(p_competition_id) or public.is_platform_admin()) then
    raise exception 'Sin permiso para exportar esta competencia' using errcode = '42501';
  end if;

  -- Prevent overlapping running jobs for the same competition/team scope.
  if exists (
    select 1 from public.export_jobs j
    where j.competition_id = p_competition_id
      and j.status in ('pending', 'running')
      and (p_team_id is null or j.team_id is not distinct from p_team_id)
  ) then
    raise exception 'Ya hay una exportación en curso para este alcance'
      using errcode = 'check_violation';
  end if;

  snap := public.get_competition_export_snapshot(p_competition_id, p_team_id);
  select coalesce(array_agg(x.id), '{}') into reg_ids
  from jsonb_to_recordset(snap -> 'registrations') as x(id uuid);

  if coalesce(array_length(reg_ids, 1), 0) = 0 then
    raise exception 'No hay inscripciones aceptadas para exportar'
      using errcode = 'check_violation';
  end if;

  -- Export may run after the registration window closes; ignore window/status codes
  -- that only apply to coach submit, keep sports-content errors.
  foreach rid in array reg_ids loop
    for issue in
      select value from jsonb_array_elements(public.validate_registration(rid)) value
      where value ->> 'level' = 'error'
        and coalesce(value ->> 'code', '') not in (
          'competition_closed', 'registration_not_open', 'registration_closed'
        )
    loop
      errors := errors || jsonb_build_array(issue || jsonb_build_object('registration_id', rid));
    end loop;
  end loop;

  if jsonb_array_length(errors) > 0 then
    raise exception 'Hay errores de validación que impiden exportar'
      using errcode = 'check_violation', detail = errors::text;
  end if;

  select coalesce(max(version), 0) + 1 into next_version
  from public.export_jobs where competition_id = p_competition_id;

  team_count := jsonb_array_length(snap -> 'teams');
  athlete_count := jsonb_array_length(snap -> 'athletes');
  entry_count := jsonb_array_length(snap -> 'entries');

  insert into public.export_jobs (
    competition_id, team_id, format, version, status, requested_by, summary, error_report
  ) values (
    p_competition_id,
    p_team_id,
    p_format,
    next_version,
    'running',
    auth.uid(),
    jsonb_build_object(
      'teams', team_count,
      'athletes', athlete_count,
      'entries', entry_count,
      'registrations', coalesce(array_length(reg_ids, 1), 0)
    ),
    '[]'::jsonb
  ) returning * into job;

  insert into public.export_job_items (export_job_id, registration_id, status)
  select job.id, r, 'pending' from unnest(reg_ids) as r;

  perform public.log_action(
    'rpc:prepare_export_job',
    'export_jobs',
    job.id,
    jsonb_build_object('format', p_format, 'team_id', p_team_id, 'counts', job.summary)
  );

  return jsonb_build_object(
    'job', to_jsonb(job),
    'snapshot', snap
  );
end $$;

create or replace function public.complete_export_job(
  p_job_id uuid,
  p_file_path text,
  p_file_name text default null
) returns public.export_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  job public.export_jobs;
  rid uuid;
begin
  select * into job from public.export_jobs where id = p_job_id for update;
  if job.id is null then
    raise exception 'Exportación no encontrada' using errcode = 'P0002';
  end if;
  if not (public.is_competition_organizer(job.competition_id) or public.is_platform_admin()) then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  if job.status not in ('pending', 'running') then
    raise exception 'La exportación ya finalizó' using errcode = 'check_violation';
  end if;
  if coalesce(trim(p_file_path), '') = '' then
    raise exception 'Ruta de archivo requerida' using errcode = 'check_violation';
  end if;

  update public.export_jobs
    set status = 'completed',
        file_path = p_file_path,
        file_name = coalesce(p_file_name, p_file_path),
        completed_at = now(),
        error_report = '[]'::jsonb
  where id = p_job_id
  returning * into job;

  update public.export_job_items
    set status = 'exported', message = null
  where export_job_id = p_job_id;

  for rid in
    select registration_id from public.export_job_items where export_job_id = p_job_id
  loop
    update public.registrations
      set status = 'exported'
    where id = rid and status = 'accepted';
    if found then
      insert into public.registration_status_history (registration_id, from_status, to_status, changed_by)
      values (rid, 'accepted', 'exported', auth.uid());
    end if;
  end loop;

  perform public.log_action('rpc:complete_export_job', 'export_jobs', p_job_id,
    jsonb_build_object('file_path', p_file_path));
  return job;
end $$;

create or replace function public.fail_export_job(
  p_job_id uuid,
  p_errors jsonb default '[]'::jsonb
) returns public.export_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  job public.export_jobs;
begin
  select * into job from public.export_jobs where id = p_job_id for update;
  if job.id is null then
    raise exception 'Exportación no encontrada' using errcode = 'P0002';
  end if;
  if not (public.is_competition_organizer(job.competition_id) or public.is_platform_admin()) then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;

  update public.export_jobs
    set status = 'failed',
        error_report = coalesce(p_errors, '[]'::jsonb),
        completed_at = now()
  where id = p_job_id
  returning * into job;

  update public.export_job_items
    set status = 'failed', message = 'Exportación fallida'
  where export_job_id = p_job_id and status = 'pending';

  perform public.log_action('rpc:fail_export_job', 'export_jobs', p_job_id, jsonb_build_object('errors', p_errors));
  return job;
end $$;

grant execute on function public.get_competition_export_snapshot(uuid, uuid) to authenticated;
grant execute on function public.prepare_export_job(uuid, text, uuid) to authenticated;
grant execute on function public.complete_export_job(uuid, text, text) to authenticated;
grant execute on function public.fail_export_job(uuid, jsonb) to authenticated;
