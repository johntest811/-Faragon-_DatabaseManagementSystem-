import crypto from "node:crypto";
import process from "node:process";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local", override: false });
dotenv.config({ path: ".env", override: false });

const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!url || !serviceRoleKey) {
  throw new Error("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: accounts, error: accountsError } = await supabase
  .from("admins")
  .select("id, username, password, role, is_active, auth_user_id, auth_email")
  .order("created_at");
if (accountsError) {
  throw new Error(`Run the prepare production-auth migration first: ${accountsError.message}`);
}

let authUsers = [];
for (let page = 1; page <= 20; page += 1) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  authUsers = authUsers.concat(data.users);
  if (data.users.length < 1000) break;
}
const authByEmail = new Map(authUsers.map((user) => [String(user.email ?? "").toLowerCase(), user]));

let migrated = 0;
let reused = 0;
const deactivatedWeakAccounts = [];

for (const account of accounts ?? []) {
  const currentPassword = String(account.password ?? "");
  const weakPassword = currentPassword.length < 8;
  const authEmail = String(account.auth_email ?? "").trim().toLowerCase() ||
    `account-${String(account.id).replace(/-/g, "")}@auth.faragon.internal`;

  let authUser = account.auth_user_id
    ? authUsers.find((user) => user.id === account.auth_user_id) ?? null
    : authByEmail.get(authEmail) ?? null;
  let createdNow = false;

  if (!authUser) {
    const authPassword = currentPassword.length >= 6
      ? currentPassword
      : crypto.randomBytes(32).toString("base64url");
    const { data, error } = await supabase.auth.admin.createUser({
      email: authEmail,
      password: authPassword,
      email_confirm: true,
      app_metadata: { account_type: account.role === "security" ? "security" : "administrative" },
    });
    if (error || !data.user) throw error ?? new Error(`Unable to migrate ${account.username}.`);
    authUser = data.user;
    createdNow = true;
  } else {
    reused += 1;
  }

  const { error: updateError } = await supabase.from("admins").update({
    auth_user_id: authUser.id,
    auth_email: authEmail,
    password_migrated_at: new Date().toISOString(),
    must_change_password: weakPassword,
    is_active: weakPassword ? false : Boolean(account.is_active),
  }).eq("id", account.id);

  if (updateError) {
    if (createdNow) await supabase.auth.admin.deleteUser(authUser.id);
    throw updateError;
  }

  if (weakPassword) deactivatedWeakAccounts.push(account.username);
  migrated += 1;
}

console.log(`Migrated ${migrated} admin account(s) to Supabase Auth; reused ${reused} existing Auth user(s).`);
if (deactivatedWeakAccounts.length) {
  console.log(`Deactivated weak-password account(s) pending an 8+ character reset: ${deactivatedWeakAccounts.join(", ")}`);
}
