-- Adds additional scanned documents for applicants/employees.
-- Run in the Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.applicant_other_documents (
  document_id uuid not null default gen_random_uuid(),
  applicant_id uuid not null,
  label text not null default '',
  bucket text not null default 'certificates' check (bucket in ('applicants', 'certificates', 'licensure')),
  file_path text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint applicant_other_documents_pkey primary key (document_id),
  constraint applicant_other_documents_applicant_id_fkey foreign key (applicant_id) references public.applicants(applicant_id)
);

create index if not exists applicant_other_documents_applicant_id_created_at_idx
  on public.applicant_other_documents (applicant_id, created_at desc);
