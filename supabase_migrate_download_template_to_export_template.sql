-- Remap legacy column permission key `download_template` -> `export_template`
-- across access/override records.
--
-- Safe + idempotent:
-- 1) removes duplicate legacy rows if a target row already exists
-- 2) updates remaining legacy rows to the new key

begin;

-- 1) Admin column overrides
-- Drop legacy rows that would collide with existing export_template rows.
delete from public.admin_column_access_overrides old
using public.admin_column_access_overrides new_row
where old.admin_id = new_row.admin_id
  and old.module_key = new_row.module_key
  and old.column_key = 'download_template'
  and new_row.column_key = 'export_template';

-- Migrate remaining legacy rows.
update public.admin_column_access_overrides
set column_key = 'export_template'
where column_key = 'download_template';

-- 2) User column overrides
-- Drop legacy rows that would collide with existing export_template rows.
delete from public.user_column_access_overrides old
using public.user_column_access_overrides new_row
where old.user_id = new_row.user_id
  and old.module_key = new_row.module_key
  and old.column_key = 'download_template'
  and new_row.column_key = 'export_template';

-- Migrate remaining legacy rows.
update public.user_column_access_overrides
set column_key = 'export_template'
where column_key = 'download_template';

-- 3) Pending/history access requests
update public.access_requests
set requested_column_key = 'export_template'
where requested_column_key = 'download_template';

commit;
