import crypto from "node:crypto";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local", override: false });
dotenv.config({ path: ".env", override: false });

const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const anonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!url || !anonKey || !serviceRoleKey) throw new Error("Supabase environment variables are incomplete.");

const service = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anonymous = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function expectDenied(label, query) {
  const result = await query;
  if (!result.error) throw new Error(`${label} unexpectedly allowed anonymous access.`);
}

await expectDenied("admins", anonymous.from("admins").select("id").limit(1));
await expectDenied("applicants", anonymous.from("applicants").select("applicant_id").limit(1));
await expectDenied("RBAC", anonymous.from("role_module_access").select("role_id").limit(1));
await expectDenied("email settings", anonymous.from("notification_email_settings").select("gmail_user").limit(1));

const { data: accounts, error: accountsError } = await service
  .from("admins")
  .select("id, username, auth_email, auth_user_id, is_active")
  .order("username");
if (accountsError) throw accountsError;
const activeAccount = accounts?.find((account) => account.is_active && account.auth_email);
const inactiveAccount = accounts?.find((account) => !account.is_active && account.auth_email);
if (!activeAccount) throw new Error("No active migrated account is available for verification.");

async function createOneTimeSession(account) {
  const { data: linkData, error: linkError } = await service.auth.admin.generateLink({
    type: "magiclink",
    email: account.auth_email,
  });
  if (linkError || !linkData.properties?.hashed_token) throw linkError ?? new Error("Unable to create a verification token.");

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: verification, error: verifyError } = await client.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });
  if (verifyError || verification.user?.id !== account.auth_user_id) {
    throw verifyError ?? new Error("One-time session identity mismatch.");
  }
  return client;
}

const activeClient = await createOneTimeSession(activeAccount);
const { data: activeProfile, error: activeProfileError } = await activeClient
  .from("admins")
  .select("id, username, role, is_active")
  .eq("id", activeAccount.id)
  .maybeSingle();
if (activeProfileError || activeProfile?.id !== activeAccount.id || activeProfile.is_active !== true) {
  throw activeProfileError ?? new Error("Active account cannot read its authorized profile.");
}
const { error: roleError } = await activeClient.from("role_module_access").select("module_key").limit(1);
if (roleError) throw roleError;
const secretColumnAttempt = await activeClient
  .from("notification_email_settings")
  .select("gmail_app_password")
  .limit(1);
if (!secretColumnAttempt.error) throw new Error("The Gmail app password is readable by the client.");

const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
const securedBucketIds = ["applicants", "certificates", "licensure", "Profile", "inventory", "paraphernalia"];
const { data: buckets, error: bucketsError } = await service.storage.listBuckets();
if (bucketsError) throw bucketsError;
for (const bucketId of securedBucketIds) {
  const bucket = buckets.find((item) => item.id === bucketId);
  if (!bucket) throw new Error(`Required Storage bucket ${bucketId} does not exist.`);
  if (bucket.public) throw new Error(`Storage bucket ${bucketId} is still public.`);
  const anonymousList = await anonymous.storage.from(bucketId).list("", { limit: 1 });
  if (!anonymousList.error && (anonymousList.data?.length ?? 0) > 0) {
    throw new Error(`Anonymous users can list objects in the ${bucketId} bucket.`);
  }
  const authorizedList = await activeClient.storage.from(bucketId).list("", { limit: 1 });
  if (authorizedList.error) throw authorizedList.error;
}

const storageTestPath = `${activeAccount.id}/production-security-${suffix}.txt`;
const storageTestBody = `storage-security-${suffix}`;
const storageUpload = await activeClient.storage
  .from("Profile")
  .upload(storageTestPath, new Blob([storageTestBody], { type: "text/plain" }));
if (storageUpload.error) throw storageUpload.error;
try {
  const publicUrl = anonymous.storage.from("Profile").getPublicUrl(storageTestPath).data.publicUrl;
  const publicResponse = await fetch(publicUrl);
  if (publicResponse.ok) throw new Error("A private profile object is still downloadable through a public URL.");

  const signed = await activeClient.storage.from("Profile").createSignedUrl(storageTestPath, 60);
  if (signed.error || !signed.data?.signedUrl) throw signed.error ?? new Error("Signed Storage URL creation failed.");
  const signedResponse = await fetch(signed.data.signedUrl);
  if (!signedResponse.ok || (await signedResponse.text()) !== storageTestBody) {
    throw new Error("The authenticated signed Storage URL did not return the expected object.");
  }
} finally {
  await activeClient.storage.from("Profile").remove([storageTestPath]);
}

// Reversible Admin Accounts Edge Function smoke test.
const temporaryUsername = `security-check-${suffix}`;
const temporaryPassword = crypto.randomBytes(24).toString("base64url");
const createResult = await activeClient.functions.invoke("admin-account-manager", {
  body: {
    action: "create",
    username: temporaryUsername,
    password: temporaryPassword,
    role: "admin",
    full_name: "Production Security Check",
    security_account: false,
  },
});
if (createResult.error || !createResult.data?.success || !createResult.data?.account_id) {
  throw createResult.error ?? new Error(createResult.data?.error || "Admin account creation smoke test failed.");
}
const temporaryAccountId = createResult.data.account_id;

const updateResult = await activeClient.functions.invoke("admin-account-manager", {
  body: {
    action: "update",
    account_id: temporaryAccountId,
    full_name: "Updated Production Security Check",
    assigned_detachment: "FARAGON",
  },
});
if (updateResult.error || !updateResult.data?.success) {
  throw updateResult.error ?? new Error(updateResult.data?.error || "Admin account update smoke test failed.");
}

// Reversible Roles and Permissions RLS smoke test.
const temporaryRoleName = `security_check_${suffix}`;
const { data: temporaryRole, error: temporaryRoleError } = await activeClient
  .from("app_roles")
  .insert({ role_name: temporaryRoleName })
  .select("role_id")
  .single();
if (temporaryRoleError || !temporaryRole?.role_id) throw temporaryRoleError ?? new Error("Role creation smoke test failed.");

const { error: moduleAccessError } = await activeClient.from("role_module_access").insert({
  role_id: temporaryRole.role_id,
  module_key: "dashboard",
  can_read: true,
  can_write: false,
  can_edit: false,
});
if (moduleAccessError) throw moduleAccessError;
const { error: columnAccessError } = await activeClient.from("role_column_access").insert({
  role_id: temporaryRole.role_id,
  module_key: "dashboard",
  column_key: "security_smoke_test",
  can_read: true,
});
if (columnAccessError) throw columnAccessError;

await activeClient.from("role_column_access").delete().eq("role_id", temporaryRole.role_id);
await activeClient.from("role_module_access").delete().eq("role_id", temporaryRole.role_id);
const { error: deleteRoleError } = await activeClient.from("app_roles").delete().eq("role_id", temporaryRole.role_id);
if (deleteRoleError) throw deleteRoleError;

const deleteResult = await activeClient.functions.invoke("admin-account-manager", {
  body: { action: "delete", account_id: temporaryAccountId },
});
if (deleteResult.error || !deleteResult.data?.success) {
  throw deleteResult.error ?? new Error(deleteResult.data?.error || "Admin account deletion smoke test failed.");
}
const { data: deletedAccount, error: deletedAccountError } = await service
  .from("admins")
  .select("id")
  .eq("id", temporaryAccountId)
  .maybeSingle();
if (deletedAccountError || deletedAccount) throw deletedAccountError ?? new Error("Temporary admin account was not deleted.");

await activeClient.auth.signOut({ scope: "local" });

if (inactiveAccount) {
  const inactiveClient = await createOneTimeSession(inactiveAccount);
  const [profileResult, businessResult] = await Promise.all([
    inactiveClient.from("admins").select("id").limit(1),
    inactiveClient.from("applicants").select("applicant_id").limit(1),
  ]);
  if (profileResult.error || (profileResult.data?.length ?? 0) !== 0) {
    throw profileResult.error ?? new Error("A deactivated account can still read an admin profile.");
  }
  if (businessResult.error || (businessResult.data?.length ?? 0) !== 0) {
    throw businessResult.error ?? new Error("A deactivated account can still read business data.");
  }
  await inactiveClient.auth.signOut({ scope: "local" });
}

const invalidResult = await anonymous.functions.invoke("admin-auth", {
  body: { username: activeAccount.username, password: "definitely-not-the-password" },
});
if (!invalidResult.error && invalidResult.data?.session) {
  throw new Error("The login endpoint accepted an invalid password.");
}

console.log("Production Auth, private Storage, anonymous denial, secret isolation, Admin Accounts, Roles, Permissions, and deactivated-account isolation all passed.");
