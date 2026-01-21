-- Fix legacy/invalid applicants.status values so updates/restores won't violate applicants_status_check
-- Safe to run multiple times.

begin;

-- Normalize ALL rows in one pass, without ever setting an invalid value.
-- This avoids failures when status contains garbage like 'activedsa' (uppercasing it would still be invalid).
update public.applicants
set status = case
  when status is null or btrim(status) = '' then 'ACTIVE'
  when upper(btrim(status)) in ('ACTIVE', 'INACTIVE') then upper(btrim(status))
  else 'ACTIVE'
end
where
  status is null
  or btrim(status) = ''
  or upper(btrim(status)) not in ('ACTIVE', 'INACTIVE')
  or status <> upper(btrim(status));

-- 4) Now that data is clean, validate the constraint (if it was created NOT VALID)
-- If this errors because it's already valid, you can ignore it.
alter table public.applicants validate constraint applicants_status_check;

commit;
