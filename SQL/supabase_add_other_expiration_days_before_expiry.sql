-- Adds per-item days-before-expiry to other expiration records.
-- Run in Supabase SQL editor.

alter table if exists public.other_expiration_items
  add column if not exists days_before_expiry integer;

update public.other_expiration_items
set days_before_expiry = 30
where days_before_expiry is null;

alter table if exists public.other_expiration_items
  alter column days_before_expiry set default 30,
  alter column days_before_expiry set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'other_expiration_items_days_before_expiry_check'
  ) then
    alter table public.other_expiration_items
      add constraint other_expiration_items_days_before_expiry_check
      check (days_before_expiry >= 1 and days_before_expiry <= 365);
  end if;
end $$;

create index if not exists other_expiration_items_days_before_expiry_idx
  on public.other_expiration_items (days_before_expiry);
