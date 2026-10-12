import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/app/Client/useRbac.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const activeAdmin = (role = "superadmin", id = "a") => ({ id, username: id, role, is_active: true });
const result = (data, error = null) => ({ data, error });
const settle = () => new Promise((resolve) => setImmediate(resolve));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// Run the actual hook with isolated state and controllable Auth/database promises.
// This is not a React lifecycle or live RLS integration test.
function mount(options = {}, hook = "useAuthRole") {
  const state = [];
  const reads = [];
  const rpcCalls = [];
  const events = new Map();
  const realtime = new Map();
  let authChange;
  let cleanup;
  let authReads = 0;
  const supabase = {
    auth: {
      async getSession() {
        authReads++;
        return options.session
          ? options.session(authReads)
          : result({ session: { user: { id: options.userId ?? "account-a" } } });
      },
      onAuthStateChange(callback) {
        authChange = callback;
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
    from(table) {
      const read = { table };
      reads.push(read);
      const query = {
        select(columns) { read.columns = columns; return query; },
        eq(column, value) { read.filter = [column, value]; return query; },
        async maybeSingle() {
          return options.admin ? options.admin(reads.length) : result(activeAdmin(" SuperAdmin "));
        },
      };
      return query;
    },
    async rpc(name) {
      rpcCalls.push(name);
      return options.rpc ? options.rpc() : result(null);
    },
    channel() {
      const channel = {
        on(_event, filter, callback) { realtime.set(filter.table, callback); return channel; },
        subscribe() { return channel; },
      };
      return channel;
    },
    async removeChannel() {},
  };
  const eventTarget = (prefix) => ({
    addEventListener(name, callback) { events.set(`${prefix}:${name}`, callback); },
    removeEventListener(name) { events.delete(`${prefix}:${name}`); },
  });
  const context = {
    exports: {},
    Error,
    require(name) {
      if (name === "./SupabaseClients") return { supabase };
      assert.equal(name, "react");
      return {
        useState(initial) {
          const index = state.length;
          state.push(initial);
          return [initial, (value) => { state[index] = value; }];
        },
        useEffect(effect) { cleanup = effect(); },
      };
    },
    localStorage: {
      getItem() {
        if (options.storageThrows) throw new Error("Storage unavailable");
        return JSON.stringify({ id: "another-account", role: "superadmin" });
      },
      setItem() {},
    },
    window: eventTarget("window"),
    document: { ...eventTarget("document"), visibilityState: "visible" },
  };
  vm.runInNewContext(compiled, context);
  context.exports[hook]();
  return {
    state, reads, rpcCalls,
    authChange: () => authChange(),
    event: (target, name, payload) => events.get(`${target}:${name}`)(payload),
    change: (table) => realtime.get(table)(),
    unmount: () => cleanup(),
  };
}

test("verified Auth-linked role needs one admin query and no RPC", async () => {
  const hook = mount();
  await settle();
  assert.deepEqual(hook.state, ["superadmin", false, ""]);
  assert.deepEqual(hook.reads, [{
    table: "admins",
    columns: "id, username, role, full_name, is_active",
    filter: ["auth_user_id", "account-a"],
  }]);
  assert.deepEqual(hook.rpcCalls, []);
});

test("refresh events reverify rather than reuse cached permissions", async () => {
  const hook = mount();
  await settle();
  const refreshes = [
    () => hook.event("window", "focus"),
    () => hook.event("document", "visibilitychange"),
    () => hook.event("window", "storage", { key: "adminSession" }),
    () => hook.change("admins"),
    () => hook.change("role_module_access"),
    () => hook.change("admin_module_access_overrides"),
  ];
  for (const refresh of refreshes) {
    const before = hook.reads.length;
    refresh();
    assert.deepEqual(hook.state, [null, true, ""]);
    await settle();
    assert.equal(hook.reads.length, before + 1);
  }
});

test("unavailable storage does not override verified database role", async () => {
  const hook = mount({ storageThrows: true });
  await settle();
  assert.deepEqual(hook.state, ["superadmin", false, ""]);
});

for (const [name, admin] of [
  ["missing", null],
  ["inactive", { ...activeAdmin(), is_active: false }],
  ["null active flag", { ...activeAdmin(), is_active: null }],
  ["absent active flag", { id: "a", role: "superadmin" }],
]) {
  test(`${name} admin stays denied with the active-admin RPC fallback`, async () => {
    const hook = mount({ admin: () => result(admin), rpc: () => result(null) });
    await settle();
    assert.deepEqual(hook.state, [null, false, ""]);
    assert.deepEqual(hook.rpcCalls, ["current_role_name"]);
  });
}

test("missing signed session ignores stored superadmin role", async () => {
  const hook = mount({ session: () => result({ session: null }) });
  await settle();
  assert.deepEqual(hook.state, [null, false, ""]);
  assert.equal(hook.reads.length, 0);
  assert.equal(hook.rpcCalls.length, 0);
});

for (const stage of ["session", "admin", "rpc"]) {
  test(`rejected ${stage} verification clears loading and denies access`, async () => {
    const hook = mount({
      ...(stage === "rpc" ? { admin: () => result(null) } : {}),
      [stage]: () => Promise.reject(new Error(`${stage} failed`)),
    });
    await settle();
    assert.deepEqual(hook.state, [null, false, `${stage} failed`]);
  });
}

test("returned database and RPC errors cannot grant a role", async () => {
  const hook = mount({
    admin: () => result(activeAdmin(), { message: "RLS denied" }),
    rpc: () => result("superadmin", { message: "RPC denied" }),
  });
  await settle();
  assert.deepEqual(hook.state, [null, false, "RPC denied"]);
});

test("account switch ignores an older elevated role result", async () => {
  const old = deferred();
  const fresh = deferred();
  const options = { admin: (count) => count === 1 ? old.promise : fresh.promise };
  const hook = mount(options);
  await settle();
  options.userId = "account-b";
  hook.authChange();
  await settle();
  fresh.resolve(result(activeAdmin("employee", "b")));
  await settle();
  old.resolve(result(activeAdmin()));
  await settle();
  assert.deepEqual(hook.state, ["employee", false, ""]);
  assert.deepEqual(hook.reads.map((read) => read.filter[1]), ["account-a", "account-b"]);
});

test("stale failures do not finish a newer pending verification", async () => {
  const old = deferred();
  const fresh = deferred();
  const hook = mount({ admin: (count) => count === 1 ? old.promise : fresh.promise });
  await settle();
  hook.authChange();
  await settle();
  old.reject(new Error("Obsolete failure"));
  await settle();
  assert.deepEqual(hook.state, [null, true, ""]);
  fresh.resolve(result(activeAdmin("employee")));
  await settle();
  assert.deepEqual(hook.state, ["employee", false, ""]);
});

test("unmount safely handles pending verification rejection", async () => {
  const pending = deferred();
  const hook = mount({ admin: () => pending.promise });
  await settle();
  hook.unmount();
  pending.reject(new Error("Late failure"));
  await settle();
  assert.deepEqual(hook.state, [null, true, ""]);
});

test("module verification rejection clears loading without a permission fallback", async () => {
  const hook = mount({ session: () => Promise.reject(new Error("Auth failed")) }, "useMyModules");
  await settle();
  assert.equal(hook.state[0].length, 0);
  assert.equal(hook.state[1], false);
  assert.equal(hook.state[2], "Auth failed");
  assert.equal(hook.rpcCalls.length, 0);
});

test("checked-in RPC requires an Auth-linked, explicitly active admin", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260810160508_prepare_production_auth.sql", import.meta.url), "utf8");
  const functionBody = (name) => {
    const start = sql.indexOf(`create or replace function ${name}()`);
    assert.notEqual(start, -1);
    return sql.slice(start, sql.indexOf("$$;", start));
  };
  assert.match(functionBody("public.current_role_name"), /select private\.current_admin_role\(\)/);
  const roleLookup = functionBody("private.current_admin_role");
  assert.match(roleLookup, /from public\.admins a/);
  assert.match(roleLookup, /a\.auth_user_id = \(select auth\.uid\(\)\)/);
  assert.match(roleLookup, /coalesce\(a\.is_active, false\) = true/);
});
