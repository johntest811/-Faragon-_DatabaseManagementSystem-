alter table if exists public.access_requests
  drop constraint if exists access_requests_requester_admin_fkey;

alter table if exists public.access_requests
  add constraint access_requests_requester_admin_fkey
  foreign key (requester_admin_id)
  references public.admins(id)
  on delete set null;

alter table if exists public.access_requests
  drop constraint if exists access_requests_approver_admin_fkey;

alter table if exists public.access_requests
  add constraint access_requests_approver_admin_fkey
  foreign key (approver_admin_id)
  references public.admins(id)
  on delete set null;
