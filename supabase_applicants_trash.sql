-- Adds Trash support to public.applicants for this app
-- Fixes: "column applicants.is_trashed does not exist"
-- Safe to run multiple times.

-- 0) Ensure FK target is valid
do $$
begin
  alter table public.admins
    add constraint admins_pkey primary key (id);
exception
  when duplicate_object then null;
end $$;

-- 1) Add trash columns
alter table public.applicants
  add column if not exists is_trashed boolean not null default false,
  add column if not exists trashed_at timestamp with time zone,
  add column if not exists trashed_by uuid;

-- 2) (Optional but recommended) Add FK to track who trashed
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
create index if not exists applicants_trashed_at_idx on public.applicants (trashed_at);

-- 3) Quick verification
-- select column_name from information_schema.columns where table_schema='public' and table_name='applicants' and column_name in ('is_trashed','trashed_at','trashed_by');
