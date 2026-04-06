-- Adds per-role column-level permissions.
-- Matches existing RBAC table conventions in Supabase_database.sql.

create table if not exists public.role_column_access (
  role_id uuid not null,
  module_key text not null,
  column_key text not null,
  can_read boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  created_by uuid,
  constraint role_column_access_pkey primary key (role_id, module_key, column_key),
  constraint role_column_access_role_id_fkey foreign key (role_id) references public.app_roles(role_id),
  constraint role_column_access_module_key_fkey foreign key (module_key) references public.modules(module_key)
);

-- Optional: helpful indexes for common lookups
create index if not exists role_column_access_role_module_idx
  on public.role_column_access (role_id, module_key);

create index if not exists role_column_access_module_idx
  on public.role_column_access (module_key);
