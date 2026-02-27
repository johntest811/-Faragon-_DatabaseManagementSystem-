-- Add an access-management module so the sidebar can show a single entry
-- that gates Admin Accounts / Roles / Permissions.

INSERT INTO public.modules (module_key, display_name, path)
VALUES ('access', 'Admin Accounts', '/Main_Modules/AdminAccounts/')
ON CONFLICT (module_key) DO UPDATE
SET display_name = EXCLUDED.display_name,
    path = EXCLUDED.path;

-- Give admin/superadmin read-write access by default.
INSERT INTO public.role_module_access (role_id, module_key, can_read, can_write)
SELECT r.role_id, 'access', true, true
FROM public.app_roles r
WHERE r.role_name IN ('superadmin', 'admin')
ON CONFLICT (role_id, module_key) DO UPDATE
SET can_read = EXCLUDED.can_read,
    can_write = EXCLUDED.can_write;
