-- Normalizes other-document rows before they hit the not-null label constraint.
-- Run this once in the Supabase SQL editor for existing databases.

create or replace function public.trg_normalize_applicant_other_documents()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.label := coalesce(nullif(btrim(new.label), ''), 'Document');
  new.bucket := coalesce(nullif(btrim(new.bucket), ''), 'certificates');
  new.file_path := coalesce(nullif(btrim(new.file_path), ''), '');
  return new;
end;
$$;

drop trigger if exists trg_normalize_applicant_other_documents on public.applicant_other_documents;

create trigger trg_normalize_applicant_other_documents
before insert or update on public.applicant_other_documents
for each row
execute function public.trg_normalize_applicant_other_documents();