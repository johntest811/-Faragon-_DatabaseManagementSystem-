import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.112.2";

const SECURITY_COLUMNS = [
  "stock_in_timestamp",
  "stock_in_date",
  "stock_in_status",
  "stock_in_item",
  "stock_in_quantity",
  "stock_in_attachment",
  "inventory_client_name",
  "inventory_items",
  "inventory_stock_balance",
  "inventory_stock_in",
  "inventory_stock_out",
  "add_stock_out",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function nullableText(value: unknown) {
  return text(value) || null;
}

function normalizedRole(value: unknown) {
  return text(value).toLowerCase().replace(/\s+/g, " ");
}

function internalEmail(accountId: string) {
  return `account-${accountId.replace(/-/g, "")}@auth.faragon.internal`;
}

async function requireSuperadmin(req: Request, admin: SupabaseClient) {
  const authorization = text(req.headers.get("authorization"));
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (!token) return { error: "Authentication required.", status: 401 } as const;

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return { error: "Your session is invalid or expired.", status: 401 } as const;

  const { data: actor, error: actorError } = await admin
    .from("admins")
    .select("id, username, role, full_name, is_active")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();
  if (actorError || !actor || actor.is_active === false) {
    return { error: "Your account is not authorized.", status: 403 } as const;
  }
  if (normalizedRole(actor.role) !== "superadmin") {
    return { error: "Only Superadmin can manage accounts.", status: 403 } as const;
  }
  return { actor, authUser: userData.user } as const;
}

async function ensureRole(admin: SupabaseClient, roleName: string) {
  const { data, error } = await admin
    .from("app_roles")
    .upsert({ role_name: roleName }, { onConflict: "role_name" })
    .select("role_id")
    .single();
  if (error || !data?.role_id) throw error ?? new Error("Unable to create the role.");
  return String(data.role_id);
}

async function configureSecurityRole(admin: SupabaseClient, roleId: string) {
  const operations = await Promise.all([
    admin.from("role_column_access").delete().eq("role_id", roleId),
    admin.from("role_module_access").delete().eq("role_id", roleId),
    admin.from("role_paraphernalia_detachment_access").delete().eq("role_id", roleId),
  ]);
  const failed = operations.find((operation) => operation.error);
  if (failed?.error) throw failed.error;

  const { error: moduleError } = await admin.from("role_module_access").insert({
    role_id: roleId,
    module_key: "paraphernalia",
    can_read: true,
    can_write: false,
    can_edit: false,
  });
  if (moduleError) throw moduleError;

  const { error: columnsError } = await admin.from("role_column_access").insert(
    SECURITY_COLUMNS.map((columnKey) => ({
      role_id: roleId,
      module_key: "paraphernalia",
      column_key: columnKey,
      can_read: true,
    })),
  );
  if (columnsError) throw columnsError;
}

async function audit(admin: SupabaseClient, actor: { id: string; username: string; full_name: string | null }, action: string, details: Record<string, unknown>) {
  const { error } = await admin.from("audit_log").insert({
    actor_user_id: actor.id,
    actor_name: actor.full_name ?? actor.username,
    action,
    page: "/Main_Modules/AdminAccounts/",
    details,
  });
  if (error) console.error("[admin-account-manager] Failed to write audit log:", error.message);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const supabaseUrl = text(Deno.env.get("SUPABASE_URL"));
  const serviceRoleKey = text(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Account service is temporarily unavailable." }, 503);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const authorization = await requireSuperadmin(req, admin);
  if ("error" in authorization) return json({ error: authorization.error }, authorization.status);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const action = text(payload.action).toLowerCase();
  try {
    if (action === "create") {
      const username = text(payload.username);
      const password = String(payload.password ?? "");
      const role = normalizedRole(payload.role);
      const fullName = nullableText(payload.full_name);
      const applicantId = nullableText(payload.applicant_id);
      const employeeNumber = nullableText(payload.employee_number);
      const assignedDetachment = nullableText(payload.assigned_detachment);
      const securityAccount = Boolean(payload.security_account || applicantId);

      if (username.length < 3 || username.length > 100) throw new Error("Username must contain 3 to 100 characters.");
      if (password.length < 8 || password.length > 128) throw new Error("Password must contain at least 8 characters.");
      if (!role) throw new Error("Role is required.");
      if (securityAccount && role === "superadmin") throw new Error("A security account cannot be assigned Superadmin.");

      const { data: existing } = await admin.from("admins").select("id").ilike("username", username).limit(1).maybeSingle();
      if (existing) throw new Error("That username is already being used.");

      const accountId = crypto.randomUUID();
      const authEmail = internalEmail(accountId);
      const roleId = await ensureRole(admin, role);
      if (securityAccount) await configureSecurityRole(admin, roleId);

      const { data: authData, error: authError } = await admin.auth.admin.createUser({
        email: authEmail,
        password,
        email_confirm: true,
        app_metadata: { account_type: securityAccount ? "security" : "administrative" },
      });
      if (authError || !authData.user) throw authError ?? new Error("Unable to create the authentication account.");

      const { error: insertError } = await admin.from("admins").insert({
        id: accountId,
        username,
        role,
        full_name: fullName,
        employee_number: employeeNumber,
        applicant_id: applicantId,
        assigned_detachment: assignedDetachment,
        is_active: true,
        auth_user_id: authData.user.id,
        auth_email: authEmail,
        must_change_password: false,
        password_migrated_at: new Date().toISOString(),
      });
      if (insertError) {
        await admin.auth.admin.deleteUser(authData.user.id);
        throw insertError;
      }

      await audit(admin, authorization.actor, securityAccount ? "ADMIN_CREATE_SECURITY_ACCOUNT" : "ADMIN_CREATE_ACCOUNT", {
        account_id: accountId,
        username,
        role,
        applicant_id: applicantId,
        assigned_detachment: assignedDetachment,
      });
      return json({ success: true, account_id: accountId });
    }

    const accountId = text(payload.account_id);
    if (!accountId) throw new Error("Account ID is required.");
    const { data: target, error: targetError } = await admin
      .from("admins")
      .select("id, username, role, full_name, auth_user_id, is_active")
      .eq("id", accountId)
      .maybeSingle();
    if (targetError || !target) throw targetError ?? new Error("Account not found.");

    if (action === "update") {
      const updates: Record<string, unknown> = {};
      if (Object.hasOwn(payload, "username")) {
        const username = text(payload.username);
        if (username.length < 3 || username.length > 100) throw new Error("Username must contain 3 to 100 characters.");
        updates.username = username;
      }
      if (Object.hasOwn(payload, "full_name")) updates.full_name = nullableText(payload.full_name);
      if (Object.hasOwn(payload, "role")) {
        const role = normalizedRole(payload.role);
        if (!role) throw new Error("Role is required.");
        await ensureRole(admin, role);
        updates.role = role;
      }
      if (Object.hasOwn(payload, "assigned_detachment")) updates.assigned_detachment = nullableText(payload.assigned_detachment);
      if (Object.hasOwn(payload, "is_active")) {
        const isActive = Boolean(payload.is_active);
        if (!isActive && target.id === authorization.actor.id) throw new Error("You cannot deactivate your own account.");
        updates.is_active = isActive;
      }

      const password = String(payload.password ?? "");
      if (password) {
        if (password.length < 8 || password.length > 128) throw new Error("Password must contain at least 8 characters.");
        const { error: passwordError } = await admin.auth.admin.updateUserById(target.auth_user_id, { password });
        if (passwordError) throw passwordError;
        updates.must_change_password = false;
        updates.password_migrated_at = new Date().toISOString();
      }

      if (Object.keys(updates).length) {
        const { error: updateError } = await admin.from("admins").update(updates).eq("id", target.id);
        if (updateError) throw updateError;
      }
      await audit(admin, authorization.actor, "ADMIN_UPDATE_ACCOUNT", {
        account_id: target.id,
        username: updates.username ?? target.username,
        role: updates.role ?? target.role,
        password_changed: Boolean(password),
        active: updates.is_active ?? target.is_active,
      });
      return json({ success: true });
    }

    if (action === "delete") {
      if (target.id === authorization.actor.id) throw new Error("You cannot delete your own account.");
      await admin.from("access_requests").update({ requester_admin_id: null }).eq("requester_admin_id", target.id);
      await admin.from("access_requests").update({ approver_admin_id: null }).eq("approver_admin_id", target.id);
      await admin.from("applicants").update({ archived_by: null }).eq("archived_by", target.id);
      await admin.from("applicants").update({ trashed_by: null }).eq("trashed_by", target.id);
      await admin.from("applicants").update({ retired_by: null }).eq("retired_by", target.id);

      const { error: deleteError } = await admin.from("admins").delete().eq("id", target.id);
      if (deleteError) throw deleteError;
      const { error: authDeleteError } = await admin.auth.admin.deleteUser(target.auth_user_id);
      if (authDeleteError) console.error("[admin-account-manager] Orphan Auth user cleanup failed:", authDeleteError.message);
      await audit(admin, authorization.actor, "ADMIN_DELETE_ACCOUNT", {
        account_id: target.id,
        username: target.username,
      });
      return json({ success: true });
    }

    return json({ error: "Unsupported action." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Account operation failed.";
    const duplicate = /duplicate|unique|already registered|already been registered/i.test(message);
    console.error("[admin-account-manager] Operation failed:", message);
    return json({ error: duplicate ? "That username is already being used." : message }, 400);
  }
});
