-- =============================================================================
-- Persist export snapshots for durable/async MDB generation (Render cold starts)
-- =============================================================================

alter table public.export_jobs
  add column if not exists snapshot jsonb,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists file_size_bytes bigint,
  add column if not exists last_error text;

comment on column public.export_jobs.snapshot is
  'Frozen export payload used by generate-mdb; never log raw contents.';

drop function if exists public.complete_export_job(uuid, text, text);
drop function if exists public.complete_export_job(uuid, text, text, bigint);

-- Store the snapshot when preparing a job (needed if Edge Function times out).
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

  if exists (
    select 1 from public.export_jobs j
    where j.competition_id = p_competition_id
      and j.status in ('pending', 'running')
      and (p_team_id is null or j.team_id is not distinct from p_team_id)
      and j.format = p_format
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
    competition_id, team_id, format, version, status, requested_by, summary, error_report, snapshot
  ) values (
    p_competition_id,
    p_team_id,
    p_format,
    next_version,
    'pending',
    auth.uid(),
    jsonb_build_object(
      'teams', team_count,
      'athletes', athlete_count,
      'entries', entry_count,
      'registrations', coalesce(array_length(reg_ids, 1), 0)
    ),
    '[]'::jsonb,
    snap
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
    'job', to_jsonb(job) - 'snapshot',
    'snapshot', snap
  );
end $$;

-- Claim a pending/running job for processing (idempotent resume).
create or replace function public.claim_export_job(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  job public.export_jobs;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;

  select * into job from public.export_jobs where id = p_job_id for update;
  if job.id is null then
    raise exception 'Exportación no encontrada' using errcode = 'P0002';
  end if;
  if not (public.is_competition_organizer(job.competition_id) or public.is_platform_admin()) then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  if job.status = 'completed' and job.file_path is not null then
    return jsonb_build_object('job', to_jsonb(job) - 'snapshot', 'already_done', true);
  end if;
  if job.status = 'failed' and job.attempt_count >= 5 then
    raise exception 'Se agotaron los reintentos de exportación' using errcode = 'check_violation';
  end if;
  if job.snapshot is null then
    raise exception 'La exportación no tiene snapshot persistido' using errcode = 'check_violation';
  end if;

  update public.export_jobs
    set status = 'running',
        attempt_count = attempt_count + 1,
        last_error = null
  where id = p_job_id
  returning * into job;

  return jsonb_build_object(
    'job', to_jsonb(job) - 'snapshot',
    'snapshot', job.snapshot,
    'already_done', false
  );
end $$;

create or replace function public.complete_export_job(
  p_job_id uuid,
  p_file_path text,
  p_file_name text default null,
  p_file_size_bytes bigint default null
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
  if job.status = 'completed' and job.file_path is not null then
    return job;
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
        file_size_bytes = p_file_size_bytes,
        completed_at = now(),
        error_report = '[]'::jsonb,
        last_error = null,
        snapshot = null
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
    jsonb_build_object('file_path', p_file_path, 'file_size_bytes', p_file_size_bytes));
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
  msg text;
begin
  select * into job from public.export_jobs where id = p_job_id for update;
  if job.id is null then
    raise exception 'Exportación no encontrada' using errcode = 'P0002';
  end if;
  if not (public.is_competition_organizer(job.competition_id) or public.is_platform_admin()) then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;

  msg := coalesce(p_errors -> 0 ->> 'message', 'Exportación fallida');

  update public.export_jobs
    set status = 'failed',
        error_report = coalesce(p_errors, '[]'::jsonb),
        last_error = left(msg, 500),
        completed_at = now()
  where id = p_job_id
  returning * into job;

  update public.export_job_items
    set status = 'failed', message = 'Exportación fallida'
  where export_job_id = p_job_id and status = 'pending';

  perform public.log_action('rpc:fail_export_job', 'export_jobs', p_job_id, jsonb_build_object('errors', p_errors));
  return job;
end $$;

grant execute on function public.claim_export_job(uuid) to authenticated;
grant execute on function public.complete_export_job(uuid, text, text, bigint) to authenticated;
