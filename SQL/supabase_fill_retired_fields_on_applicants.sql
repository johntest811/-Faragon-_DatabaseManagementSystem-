-- Auto-fill retired fields when an applicant is marked as RETIRED.
-- This lets card-based status changes succeed even when the UI does not provide the retired metadata explicitly.

create or replace function public.trg_fill_retired_fields_on_applicants()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if upper(coalesce(new.status, '')) = 'RETIRED' then
    new.retired_date := coalesce(new.retired_date, current_date);
    new.retired_reason := coalesce(nullif(btrim(new.retired_reason), ''), 'N/A');
    new.retired_at := coalesce(new.retired_at, now());
    new.retired_by := coalesce(new.retired_by, auth.uid());
  end if;

  return new;
end;
$$;

drop trigger if exists trg_fill_retired_fields_on_applicants on public.applicants;

create trigger trg_fill_retired_fields_on_applicants
before insert or update on public.applicants
for each row
execute function public.trg_fill_retired_fields_on_applicants();