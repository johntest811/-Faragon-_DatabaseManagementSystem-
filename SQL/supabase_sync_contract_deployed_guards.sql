-- Keep contracts.deployed_guards synced with active employees assigned by detachment.
--
-- The application now treats contracts.specific_area as the source list for
-- employee/applicant detachments. Run this optional script in Supabase if you
-- also want the stored contracts.deployed_guards column to be maintained by
-- the database whenever employees or contract areas change.

begin;

create or replace function public.contract_area_key(value text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(btrim(coalesce(value, '')), '[[:space:]]+', ' ', 'g'));
$$;

create or replace function public.refresh_contract_deployed_guards_for_area(target_area text)
returns void
language plpgsql
as $$
begin
  if nullif(public.contract_area_key(target_area), '') is null then
    return;
  end if;

  update public.contracts c
  set deployed_guards = (
    select count(*)::integer
    from public.applicants a
    where coalesce(a.is_archived, false) = false
      and coalesce(a.is_trashed, false) = false
      and upper(coalesce(nullif(btrim(a.status::text), ''), 'ACTIVE')) = 'ACTIVE'
      and public.contract_area_key(a.detachment::text) = public.contract_area_key(target_area)
  )
  where public.contract_area_key(c.specific_area::text) = public.contract_area_key(target_area);
end;
$$;

create or replace function public.refresh_all_contract_deployed_guards()
returns void
language plpgsql
as $$
declare
  area_row record;
begin
  update public.contracts
  set deployed_guards = 0
  where nullif(public.contract_area_key(specific_area::text), '') is null;

  for area_row in
    select distinct specific_area
    from public.contracts
    where nullif(public.contract_area_key(specific_area::text), '') is not null
  loop
    perform public.refresh_contract_deployed_guards_for_area(area_row.specific_area);
  end loop;
end;
$$;

create or replace function public.refresh_contract_deployed_guards_from_applicant()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_contract_deployed_guards_for_area(old.detachment::text);
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.detachment is distinct from new.detachment then
      perform public.refresh_contract_deployed_guards_for_area(old.detachment::text);
      perform public.refresh_contract_deployed_guards_for_area(new.detachment::text);
    elsif old.status is distinct from new.status
      or old.is_archived is distinct from new.is_archived
      or old.is_trashed is distinct from new.is_trashed then
      perform public.refresh_contract_deployed_guards_for_area(new.detachment::text);
    end if;
    return new;
  end if;

  perform public.refresh_contract_deployed_guards_for_area(new.detachment::text);
  return new;
end;
$$;

drop trigger if exists applicants_refresh_contract_deployed_guards_trigger on public.applicants;

create trigger applicants_refresh_contract_deployed_guards_trigger
after insert or update of detachment, status, is_archived, is_trashed or delete on public.applicants
for each row
execute function public.refresh_contract_deployed_guards_from_applicant();

create or replace function public.refresh_contract_deployed_guards_from_contract()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.specific_area is distinct from new.specific_area then
    perform public.refresh_contract_deployed_guards_for_area(old.specific_area::text);
  end if;

  perform public.refresh_contract_deployed_guards_for_area(new.specific_area::text);
  return new;
end;
$$;

drop trigger if exists contracts_refresh_deployed_guards_trigger on public.contracts;

create trigger contracts_refresh_deployed_guards_trigger
after insert or update of specific_area on public.contracts
for each row
execute function public.refresh_contract_deployed_guards_from_contract();

select public.refresh_all_contract_deployed_guards();

commit;
