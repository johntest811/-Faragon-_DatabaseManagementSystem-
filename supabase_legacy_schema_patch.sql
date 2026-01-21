-- Patch for the current workspace UI
-- Targets the schema shown in Supabase_database.sql (admins/applicants/etc)
-- Safe to run multiple times.

begin;

-- Ensure public.admins(id) is a valid FK target (must be PRIMARY KEY or UNIQUE)
do $$
begin
  -- Will fail if duplicates exist; that indicates corrupted data that must be cleaned.
  alter table public.admins
    add constraint admins_pkey primary key (id);
exception
  when duplicate_object then null;
end $$;

-- Applicants Trash fields (used by Employees/Archive/Trash pages)
alter table public.applicants
  add column if not exists is_trashed boolean not null default false,
  add column if not exists trashed_at timestamp with time zone,
  add column if not exists trashed_by uuid;

-- Optional: connect archived_by/trashed_by to public.admins(id)
-- (Supabase_database.sql defines these columns but no FK)
do $$
begin
  alter table public.applicants
    add constraint applicants_archived_by_fkey
    foreign key (archived_by) references public.admins(id)
    on delete set null;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.applicants
    add constraint applicants_trashed_by_fkey
    foreign key (trashed_by) references public.admins(id)
    on delete set null;
exception
  when duplicate_object then null;
end $$;

create index if not exists applicants_is_trashed_idx on public.applicants (is_trashed);
create index if not exists applicants_is_archived_idx on public.applicants (is_archived);

commit;
