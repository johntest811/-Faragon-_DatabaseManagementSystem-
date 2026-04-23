-- Adds delete/write access request support to access_requests.
-- Run this against existing databases before using the updated Requests/Queue UI.

alter table if exists public.access_requests
  add column if not exists requested_can_write boolean not null default false;
