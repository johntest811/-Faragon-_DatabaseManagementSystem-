-- Replace REASSIGN with AWOL, add applicant detachment history tracking,
-- and relabel the workforce module path/display name to AWOL.

begin;

do $$
declare
  c record;
begin
  for c in
    select pc.conname
    from pg_constraint pc
    join pg_class r on r.oid = pc.conrelid
    join pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'public'
      and r.relname = 'applicants'
      and pc.contype = 'c'
      and lower(pg_get_constraintdef(pc.oid)) like '%status%'
  loop
    execute format('alter table public.applicants drop constraint if exists %I', c.conname);
  end loop;
end $$;

update public.applicants
set status = case
  when nullif(btrim(status), '') is null then status
  when upper(btrim(status)) = 'REASSIGN' then 'AWOL'
  else upper(btrim(status))
end
where status is not null;

alter table public.applicants
  add constraint applicants_status_check
  check (
    nullif(btrim(status::text), ''::text) is null or
    upper(nullif(btrim(status::text), ''::text)) = any (
      array[
        'ACTIVE'::text,
        'INACTIVE'::text,
        'APPLICANT'::text,
        'AWOL'::text,
        'RETIRED'::text,
        'RESIGNED'::text
      ]
    )
  );

create table if not exists public.applicant_detachment_history (
  detachment_history_id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.applicants(applicant_id) on delete cascade,
  previous_detachment text,
  new_detachment text,
  change_type text not null default 'UPDATED'
    check (change_type in ('INITIAL', 'UPDATED', 'CLEARED')),
  changed_at timestamp with time zone not null default now()
);

create index if not exists applicant_detachment_history_applicant_changed_at_idx
  on public.applicant_detachment_history (applicant_id, changed_at desc);

create or replace function public.log_applicant_detachment_history()
returns trigger
language plpgsql
as $$
declare
  previous_value text;
  next_value text;
  next_change_type text;
begin
  if tg_op = 'INSERT' then
    next_value := nullif(btrim(coalesce(new.detachment, '')), '');
    if next_value is not null then
      insert into public.applicant_detachment_history (
        applicant_id,
        previous_detachment,
        new_detachment,
        change_type,
        changed_at
      )
      values (
        new.applicant_id,
        null,
        next_value,
        'INITIAL',
        coalesce(new.created_at, now())
      );
    end if;
    return new;
  end if;

  previous_value := nullif(btrim(coalesce(old.detachment, '')), '');
  next_value := nullif(btrim(coalesce(new.detachment, '')), '');

  if previous_value is not distinct from next_value then
    return new;
  end if;

  next_change_type := case
    when next_value is null then 'CLEARED'
    when previous_value is null then 'INITIAL'
    else 'UPDATED'
  end;

  insert into public.applicant_detachment_history (
    applicant_id,
    previous_detachment,
    new_detachment,
    change_type,
    changed_at
  )
  values (
    new.applicant_id,
    previous_value,
    next_value,
    next_change_type,
    now()
  );

  return new;
end;
$$;

drop trigger if exists applicants_detachment_history_trigger on public.applicants;

create trigger applicants_detachment_history_trigger
after insert or update of detachment on public.applicants
for each row
execute function public.log_applicant_detachment_history();

insert into public.applicant_detachment_history (
  applicant_id,
  previous_detachment,
  new_detachment,
  change_type,
  changed_at
)
select
  a.applicant_id,
  null,
  nullif(btrim(a.detachment), ''),
  'INITIAL',
  coalesce(a.created_at, now())
from public.applicants a
where nullif(btrim(coalesce(a.detachment, '')), '') is not null
  and not exists (
    select 1
    from public.applicant_detachment_history h
    where h.applicant_id = a.applicant_id
  );

update public.modules
set display_name = 'AWOL',
    path = '/Main_Modules/AWOL/'
where module_key = 'reassign';

update public.access_requests
set requested_path = '/Main_Modules/AWOL/'
where requested_module_key = 'reassign'
  and requested_path = '/Main_Modules/Reassign/';

commit;
