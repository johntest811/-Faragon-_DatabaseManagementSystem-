-- Persistent job-title choices for Applicants and Employees.
-- Run in Supabase SQL Editor before deploying this update. Safe to rerun.
-- Requires the existing production-auth migration; never grants anonymous access.
-- Delete in the app hides a choice; historical employee positions are preserved.

begin;

do $$
declare
  seed_catalog boolean;
  policy_row record;
  identity_sequence text;
begin
  if to_regprocedure('private.has_any_module_access(text[],boolean)') is null then
    raise exception 'Apply the production-auth migrations before this job-title migration.';
  end if;

  seed_catalog := not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'job_titles' and column_name = 'is_active'
  );

  create table if not exists public.job_titles (
    title_id uuid primary key default gen_random_uuid(),
    title text not null,
    is_active boolean not null default true
  );
  alter table public.job_titles add column if not exists is_active boolean not null default true;
  update public.job_titles set is_active = true where is_active is null;
  alter table public.job_titles alter column is_active set default true,
    alter column is_active set not null;

  -- Keep duplicate IDs intact for any legacy references, but expose one choice.
  update public.job_titles set is_active = false
  where nullif(btrim(regexp_replace(title, '[[:space:]]+', ' ', 'g')), '') is null;
  if not exists (
    select 1 from pg_constraint where conrelid = 'public.job_titles'::regclass
      and conname = 'job_titles_active_title_check'
  ) then
    alter table public.job_titles add constraint job_titles_active_title_check check (
      not is_active or nullif(btrim(regexp_replace(title, '[[:space:]]+', ' ', 'g')), '') is not null
    );
  end if;
  with ranked as (
    select title_id, row_number() over (
      partition by upper(btrim(regexp_replace(title, '[[:space:]]+', ' ', 'g')))
      order by title_id
    ) as position
    from public.job_titles where is_active
  )
  update public.job_titles item set is_active = false
  from ranked where ranked.title_id = item.title_id and ranked.position > 1;

  create unique index if not exists job_titles_active_normalized_uidx
    on public.job_titles (upper(btrim(regexp_replace(title, '[[:space:]]+', ' ', 'g'))))
    where is_active;

  -- Only the initial upgrade copies positions. Reruns must not revive removed titles.
  if seed_catalog then
    insert into public.job_titles (title)
    select distinct upper(btrim(regexp_replace(a.client_position, '[[:space:]]+', ' ', 'g')))
    from public.applicants a
    where nullif(btrim(regexp_replace(a.client_position, '[[:space:]]+', ' ', 'g')), '') is not null
      and not exists (
        select 1 from public.job_titles jt
        where upper(btrim(regexp_replace(jt.title, '[[:space:]]+', ' ', 'g'))) =
          upper(btrim(regexp_replace(a.client_position, '[[:space:]]+', ' ', 'g')))
      )
    on conflict do nothing;
  end if;

  alter table public.job_titles enable row level security;
  for policy_row in
    select policyname from pg_policies where schemaname = 'public' and tablename = 'job_titles'
  loop
    execute format('drop policy %I on public.job_titles', policy_row.policyname);
  end loop;

  revoke all privileges on public.job_titles from public, anon, authenticated;
  grant select, insert, update on public.job_titles to authenticated;
  grant all privileges on public.job_titles to service_role;

  -- Also support installations where the existing title_id is a serial/identity.
  identity_sequence := pg_get_serial_sequence('public.job_titles', 'title_id');
  if identity_sequence is not null then
    execute format('revoke all on sequence %s from public, anon', identity_sequence);
    execute format('grant usage, select on sequence %s to authenticated, service_role', identity_sequence);
  end if;
end
$$;

create policy job_titles_read on public.job_titles for select to authenticated
using ((select private.has_any_module_access(
  array['applicants','employees','reassign','resigned','retired','floating','archive','trash'], false)));

create policy job_titles_add on public.job_titles for insert to authenticated
with check ((select private.has_any_module_access(array['applicants','employees'], true)));

create policy job_titles_change on public.job_titles for update to authenticated
using ((select private.has_any_module_access(array['applicants','employees'], true)))
with check ((select private.has_any_module_access(array['applicants','employees'], true)));

comment on table public.job_titles is
  'Shared workforce job-title catalog. is_active=false removes a dropdown choice without changing employee records.';

notify pgrst, 'reload schema';
commit;
