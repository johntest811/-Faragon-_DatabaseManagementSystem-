import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2.112.2";

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

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function clientIp(req: Request) {
  return text(req.headers.get("cf-connecting-ip")) ||
    text(req.headers.get("x-real-ip")) ||
    text(req.headers.get("x-forwarded-for")).split(",")[0]?.trim() ||
    "unknown";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const supabaseUrl = text(Deno.env.get("SUPABASE_URL"));
  const serviceRoleKey = text(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const anonKey = text(Deno.env.get("SUPABASE_ANON_KEY"));
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    console.error("[admin-auth] Missing required Supabase environment variables.");
    return json({ error: "Authentication service is temporarily unavailable." }, 503);
  }

  let payload: { username?: unknown; password?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const username = text(payload.username);
  const normalizedUsername = username.toLowerCase();
  const password = String(payload.password ?? "");
  if (!username || !password || username.length > 128 || password.length > 256) {
    return json({ error: "Invalid username or password." }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const publicClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const attemptKey = await sha256(`${clientIp(req)}:${normalizedUsername}`);
  const now = new Date();
  const windowMs = 15 * 60 * 1000;
  const maxFailures = 5;

  const { data: rateRow, error: rateError } = await admin
    .from("admin_auth_rate_limits")
    .select("failure_count, window_started_at, blocked_until")
    .eq("attempt_key", attemptKey)
    .maybeSingle();
  if (rateError) {
    console.error("[admin-auth] Failed to read rate limit state:", rateError.message);
    return json({ error: "Authentication service is temporarily unavailable." }, 503);
  }

  const blockedUntil = rateRow?.blocked_until ? new Date(rateRow.blocked_until) : null;
  if (blockedUntil && blockedUntil.getTime() > now.getTime()) {
    return json({ error: "Too many sign-in attempts. Please wait 15 minutes and try again." }, 429);
  }

  async function recordFailure() {
    const windowStartedAt = rateRow?.window_started_at ? new Date(rateRow.window_started_at) : null;
    const inCurrentWindow = Boolean(windowStartedAt && now.getTime() - windowStartedAt.getTime() < windowMs);
    const nextFailureCount = inCurrentWindow ? Number(rateRow?.failure_count ?? 0) + 1 : 1;
    const nextBlockedUntil = nextFailureCount >= maxFailures
      ? new Date(now.getTime() + windowMs).toISOString()
      : null;
    const { error } = await admin.from("admin_auth_rate_limits").upsert({
      attempt_key: attemptKey,
      failure_count: nextFailureCount,
      window_started_at: inCurrentWindow && windowStartedAt ? windowStartedAt.toISOString() : now.toISOString(),
      blocked_until: nextBlockedUntil,
      updated_at: now.toISOString(),
    }, { onConflict: "attempt_key" });
    if (error) console.error("[admin-auth] Failed to record rate limit state:", error.message);
  }

  const { data: account, error: accountError } = await admin
    .from("admins")
    .select("id, username, role, full_name, is_active, profile_image_path, assigned_detachment, auth_email, auth_user_id, must_change_password")
    .ilike("username", username)
    .limit(1)
    .maybeSingle();

  if (accountError || !account?.auth_email || !account?.auth_user_id || account.is_active === false) {
    await recordFailure();
    await new Promise((resolve) => setTimeout(resolve, 350));
    return json({ error: "Invalid username or password." }, 401);
  }

  const { data: signInData, error: signInError } = await publicClient.auth.signInWithPassword({
    email: account.auth_email,
    password,
  });

  if (signInError || !signInData.session || signInData.user.id !== account.auth_user_id) {
    await recordFailure();
    return json({ error: "Invalid username or password." }, 401);
  }

  await admin.from("admin_auth_rate_limits").delete().eq("attempt_key", attemptKey);

  const loggedInAt = now.toISOString();
  const [{ error: lastLoginError }, { error: historyError }] = await Promise.all([
    admin.from("admins").update({ last_login: loggedInAt }).eq("id", account.id),
    admin.from("admin_login_history").insert({
      admin_id: account.id,
      username: account.username,
      full_name: account.full_name ?? null,
      role: account.role ?? null,
      logged_in_at: loggedInAt,
    }),
  ]);
  if (lastLoginError) console.error("[admin-auth] Failed to update last login:", lastLoginError.message);
  if (historyError) console.error("[admin-auth] Failed to write login history:", historyError.message);

  return json({
    session: {
      access_token: signInData.session.access_token,
      refresh_token: signInData.session.refresh_token,
      expires_at: signInData.session.expires_at,
      expires_in: signInData.session.expires_in,
    },
    admin: {
      id: account.id,
      username: account.username,
      role: text(account.role).toLowerCase(),
      full_name: account.full_name ?? null,
      profile_image_path: account.profile_image_path ?? null,
      assigned_detachment: account.assigned_detachment ?? null,
      must_change_password: Boolean(account.must_change_password),
      loginTime: loggedInAt,
    },
  });
});
