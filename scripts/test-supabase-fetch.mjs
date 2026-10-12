import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/app/Client/supabaseFetch.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { createSupabaseFetch } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const url = "https://example.test/rest/v1/admins?select=id";
const headers = { Authorization: "Bearer account-a" };

test("concurrent identical reads share one request but independent response bodies", async () => {
  let calls = 0;
  const fetch = createSupabaseFetch({ fetch: async () => { calls++; return Response.json([{ id: 1 }]); } });
  const [a, b] = await Promise.all([fetch(url, { headers }), fetch(url, { headers })]);
  assert.equal(calls, 1);
  assert.deepEqual(await a.json(), await b.json());
  await fetch(url, { headers });
  assert.equal(calls, 2, "Do not cache completed permission/data reads");
});

test("different accounts, range headers and methods never share requests", async () => {
  let calls = 0;
  const fetch = createSupabaseFetch({ fetch: async () => { calls++; return Response.json([]); } });
  await Promise.all([
    fetch(url, { headers }), fetch(url, { headers: { Authorization: "Bearer account-b" } }),
    fetch(url, { headers: { ...headers, Range: "20-39" } }), fetch(url, { headers, method: "POST", body: "{}" }),
  ]);
  assert.equal(calls, 4);
});

test("write failures are never automatically retried", async () => {
  let calls = 0;
  const fetch = createSupabaseFetch({ fetch: async () => { calls++; throw new Error("Disconnected"); } });
  await assert.rejects(fetch(url, { method: "POST", body: "{}" }), /Disconnected/);
  assert.equal(calls, 1);
});

test("reads retry transient errors once, not permanent permission/query errors", async () => {
  let calls = 0;
  const fetch = createSupabaseFetch({ sleep: async () => {}, fetch: async () => new Response("{}", { status: ++calls === 1 ? 503 : 200 }) });
  assert.equal((await fetch(url)).status, 200);
  assert.equal(calls, 2);
  for (const status of [400, 401, 403, 404, 500]) {
    let attempts = 0;
    const permanent = createSupabaseFetch({ fetch: async () => { attempts++; return new Response("{}", { status }); } });
    assert.equal((await permanent(url)).status, status);
    assert.equal(attempts, 1);
  }
});

test("rate limits honor Retry-After, isolate accounts and recover after cooldown", async () => {
  let now = 0, calls = 0;
  const fetch = createSupabaseFetch({ now: () => now, fetch: async () => {
    calls++; return new Response("{}", { status: 429, headers: { "Retry-After": "120" } });
  } });
  assert.equal((await fetch(url, { headers })).status, 429);
  assert.equal((await fetch(url, { headers })).status, 503);
  assert.equal(calls, 1);
  await fetch(url, { headers: { Authorization: "Bearer account-b" } });
  assert.equal(calls, 2);
  now = 120001;
  await fetch(url, { headers });
  assert.equal(calls, 3);
});

test("outage cooldown never blocks writes, auth or function calls", async () => {
  let calls = 0;
  const fetch = createSupabaseFetch({ sleep: async () => {}, fetch: async () => { calls++; return new Response("{}", { status: 503 }); } });
  await fetch(url);
  await fetch(url);
  assert.equal(calls, 2);
  await fetch(url, { method: "PATCH", body: "{}" });
  await fetch("https://example.test/auth/v1/user");
  await fetch("https://example.test/functions/v1/notification-worker", { method: "POST" });
  assert.equal(calls, 5);
});

test("caller aborts remain independent and do not trigger retries", async () => {
  let calls = 0;
  const fetch = createSupabaseFetch({ fetch: async (_input, init) => {
    calls++;
    return new Promise((resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")));
      setTimeout(() => resolve(Response.json([])), 10);
    });
  } });
  const controller = new AbortController();
  const first = fetch(url, { signal: controller.signal });
  const second = fetch(url);
  controller.abort();
  await assert.rejects(first, { name: "AbortError" });
  assert.equal((await second).status, 200);
  assert.equal(calls, 2);
});

test("network failures and timeouts are bounded and cool down repeated reads", async () => {
  let calls = 0;
  const fetch = createSupabaseFetch({ sleep: async () => {}, readTimeoutMs: 5, fetch: async (_input, init) => {
    calls++;
    return new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("Timeout", "AbortError"))));
  } });
  await assert.rejects(fetch(url), { name: "AbortError" });
  assert.equal(calls, 2);
  assert.equal((await fetch(url)).status, 503);
  assert.equal(calls, 2);
});
