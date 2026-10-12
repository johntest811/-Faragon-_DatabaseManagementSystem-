import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Run with: node --test scripts/test-notification-usage.mjs
// No runtime imports, credentials, Supabase clients, SMTP connections, or network
// APIs are available to the worker: all I/O is replaced inside an isolated VM.
const workerUrl = new URL("../supabase/functions/notification-worker/index.ts", import.meta.url);
const electronUrl = new URL("../electron/main.js", import.meta.url);
const fixedNow = "2026-10-11T00:00:00Z";

function clockAt(iso) {
  return class extends Date {
    constructor(...args) {
      if (args.length) super(...args);
      else super(iso);
    }
    static now() { return new Date(iso).getTime(); }
  };
}
const source = readFileSync(workerUrl, 'utf8').replace(/^import .*;\r?$/gm, '');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }, reportDiagnostics: true });
assert.equal(compiled.diagnostics.length, 0);
const tick = () => new Promise(r => setImmediate(r));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } };
function setup(options = {}) {
  const reads = [], writes = [], mails = [], rpcs = [];
  const data = {
    notification_email_settings: { gmail_user: 'sender@example.test', gmail_app_password: 'fake', is_active: true },
    notification_preferences: { is_enabled: true, use_supabase_email_sender: true, use_scheduled_send: false, ...options.preferences },
    notification_recipients: [{ email: 'general@example.test' }],
    car_insurance_notification_recipients: [{ email: 'car@example.test' }],
    contract_notification_recipients: [{ email: 'contract@example.test' }],
    ...options.tables
  };
  const admin = {
    from(table) {
      reads.push(table);
      let result = { data: data[table] ?? [], error: null };
      const query = new Proxy({}, {        
get(_, key) {
          if (key === 'then') return (resolve, reject) => Promise.resolve(result).then(resolve, reject);
          return (...args) => {
            if (key === 'insert') { writes.push({ table, payload: args[0] }); result = { data: null, error: null }; }
            return query;
          };
        }      
});
      return query;
    },
    async rpc(name, args) {
      rpcs.push({ name, args });
      if (name === 'get_notification_worker_runtime_config') return { data: { is_enabled: true, worker_secret: 'test-secret' }, error: null };
      if (name === 'claim_notification_deliveries') return { data: options.denyClaims ? [] : args.p_deliveries, error: null };
      return { data: null, error: null };
    }
  };
  const rows = { licenses: [], other: [], contracts: [], ...options.rows };
  const ctx = vm.createContext({
    console, Response, URL, Date: clockAt(options.now ?? fixedNow), rows, admin,
    createClient: () => admin,
    nodemailer: { createTransport: () => ({ sendMail: async mail => { mails.push(mail); if (options.smtpError) throw Error('mock SMTP failure'); } }) },
    Deno: { env: { get: () => 'mock-not-a-live-endpoint' }, serve: fn => { ctx.handler = fn; } }
  });
  vm.runInContext(compiled.outputText, ctx);
  // Expiration fetches use prefiltered fixtures. The real config, eligibility,
  // recipient selection, sent-log checks, delivery claims, and handler still run.
  vm.runInContext('fetchExpiringRows=async()=>rows.licenses;fetchOtherExpiringRows=async()=>rows.other;fetchContractExpiringRows=async()=>rows.contracts;', ctx);
  const api = vm.runInContext('({executeAutomaticNotificationRun,runAutomaticNotificationsSingleFlight,isEligibleToSendNow,sendTestEmail})', ctx);
  return { ctx, api, admin, data, reads, writes, mails, rpcs, run: (all = false) => api.executeAutomaticNotificationRun(admin, { sendAllEligible: all, requireSupabaseMode: true }) };
}
const day = '2026-10-11';
const license = { applicant_id: 'a1', license_type: 'SECURITY', expires_on: day, first_name: 'A', last_name: 'B', client_email: 'employee@example.test' };
const other = (type) => ({ other_expiration_item_id: 1, item_name: 'Item', expiration_type: type, license_type: type, expires_on: day, days_before_expiry: 30, recipient_email: 'item@example.test' });
const contract = { contract_id: 'c1', contract_no: 'C1', record_name: 'Contract', license_type: 'CONTRACT EXPIRATION', expires_on: day, days_before_expiry: 30, recipient_email: 'fallback@example.test' };
const recipientReads = s => s.reads.filter(x => x.endsWith('_recipients'));
test('empty and disabled worker runs avoid all recipient reads/writes', async () => {
  for (const preferences of [{}, { is_enabled: false }, { use_supabase_email_sender: false }]) {
    const s = setup({ preferences });
    assert.equal((await s.run()).summary.sent, 0);
    assert.equal(s.reads.length, 2);
    assert.equal(s.writes.length, 0);
    assert.equal(s.mails.length, 0);
  }
});
test('category reads and all recipient routing remain intact', async () => {
  for (const [rows, expectedTables, expectedTo] of [
    [{ licenses: [license] }, ['notification_recipients'], ['general@example.test', 'employee@example.test']],
    [{ other: [other('car_insurance')] }, ['car_insurance_notification_recipients'], ['car@example.test', 'item@example.test']],
    [{ other: [other('PERMIT')] }, ['notification_recipients'], ['general@example.test', 'item@example.test']],
    [{ contracts: [contract] }, ['contract_notification_recipients'], ['contract@example.test']],
  ]) {
    const s = setup({ rows });
    await s.run();
    assert.deepEqual(recipientReads(s), expectedTables);
    assert.deepEqual(s.mails.map(x => x.to).sort(), expectedTo.sort());
    assert.equal(s.writes.filter(x => x.payload.status === 'SENT').length, expectedTo.length);
    assert.ok(s.rpcs.some(x => x.name === 'complete_notification_deliveries'));
  }
});
test('employee opt-out and contract fallback preserved', async () => {
  const s = setup({ preferences: { send_to_employees: false }, rows: { licenses: [license], contracts: [contract] }, tables: { contract_notification_recipients: [] } });
  await s.run();
  assert.deepEqual(s.mails.map(x => x.to).sort(), ['fallback@example.test', 'general@example.test']);
});
test('sent history and delivery claims both still suppress sends', async () => {
  const history = setup({    
rows: { licenses: [license] }, tables: {      
licensure_notification_log: [
        { applicant_id: 'a1', license_type: 'SECURITY', expires_on: day, recipient_email: 'employee@example.test' },
        { applicant_id: 'a1', license_type: 'SECURITY', expires_on: day, recipient_email: 'general@example.test' }
      ]    
}  
});
  await history.run();
  assert.equal(history.mails.length, 0);
  const claims = setup({ rows: { licenses: [license] }, denyClaims: true });
  assert.equal((await claims.run()).summary.skipped, 2);
  assert.equal(claims.mails.length, 0);
});
test('explicit resend-all still bypasses delivery claims', async () => {
  const s = setup({ rows: { licenses: [license] }, denyClaims: true });
  assert.equal((await s.run(true)).summary.sent, 2);
  assert.equal(s.rpcs.some(x => x.name === 'claim_notification_deliveries'), false);
});
test('SMTP failures still write FAILED logs and release claims', async () => {
  const s = setup({ rows: { licenses: [license] }, smtpError: true });
  assert.equal((await s.run()).summary.failed, 2);
  assert.equal(s.writes.filter(x => x.payload.status === 'FAILED').length, 2);
  assert.equal(s.rpcs.filter(x => x.name === 'complete_notification_deliveries' && !x.args.p_sent).length, 2);
});
test('scheduled defaults, boundary, catch-up, instant, expired and sendAll timing unchanged', async () => {
  const s = setup();
  const before = '2026-10-10T23:59:00Z'; // 07:59 in the default Asia/Manila zone.
  const base = {
    expiresOnYmd: '2026-11-10',
    daysBefore: 30,
    sendTimeLocal: '08:00',
    timeZone: 'Asia/Manila',
    includeExpired: false,
    expiredWithinDays: 7,
    now: new Date(before),
  };
  const eligible = s.api.isEligibleToSendNow;
  assert.equal(eligible(base), false);
  assert.equal(eligible({ ...base, now: new Date(fixedNow) }), true);
  assert.equal(eligible({ ...base, expiresOnYmd: '2026-11-09' }), true);
  assert.equal(eligible({ ...base, sendTimeLocal: null }), true);
  assert.equal(eligible({ ...base, expiresOnYmd: '2026-10-10' }), false);
  assert.equal(eligible({ ...base, expiresOnYmd: '2026-10-10', includeExpired: true }), true);
  assert.equal(eligible({ ...base, expiresOnYmd: '2026-10-03', includeExpired: true }), false);

  // Exercise the run itself as well as the predicate. Omitting these fields
  // checks the real config defaults (scheduled, 08:00, Asia/Manila, 30 days).
  async function runAt({ now = before, expiresOn = '2026-11-10', preferences = {}, sendAll = false } = {}) {
    const state = setup({
      now,
      rows: { licenses: [{ ...license, expires_on: expiresOn }] },
    });
    state.data.notification_preferences = {
      is_enabled: true,
      use_supabase_email_sender: true,
      ...preferences,
    };
    await state.run(sendAll);
    return state;
  }
  assert.equal((await runAt()).mails.length, 0);
  assert.equal((await runAt({ now: fixedNow })).mails.length, 2);
  assert.equal((await runAt({ preferences: { send_time_local: '' } })).mails.length, 0);
  assert.equal((await runAt({ preferences: { use_scheduled_send: false } })).mails.length, 2);
  assert.equal((await runAt({ expiresOn: '2026-11-09' })).mails.length, 2);
  assert.equal((await runAt({ expiresOn: '2026-10-10' })).mails.length, 0);
  assert.equal((await runAt({
    expiresOn: '2026-10-10',
    preferences: { include_expired: true },
  })).mails.length, 2);
  assert.equal((await runAt({
    expiresOn: '2026-10-03',
    preferences: { include_expired: true },
  })).mails.length, 0);
  assert.equal((await runAt({ sendAll: true })).mails.length, 2);

  // Item-specific lead times matter: these become due on October 11 too.
  for (const rows of [
    { other: [{ ...other('PERMIT'), expires_on: '2026-10-16', days_before_expiry: 5 }] },
    { contracts: [{ ...contract, expires_on: '2026-11-10' }] },
  ]) {
    for (const [now, shouldSend] of [[before, false], [fixedNow, true]]) {
      const state = setup({ now, rows, preferences: { use_scheduled_send: true } });
      await state.run();
      assert.equal(state.mails.length > 0, shouldSend);
    }
  }
});
test('single-flight shares concurrent work, resets after success and failure', async () => {
  const s = setup(), gate = deferred();
  s.ctx.gate = gate; s.ctx.calls = 0;
  vm.runInContext('executeAutomaticNotificationRun=async()=>{calls++;return await gate.promise}', s.ctx);
  const p = s.api.runAutomaticNotificationsSingleFlight(s.admin);
  const q = s.api.runAutomaticNotificationsSingleFlight(s.admin);
  assert.equal(s.ctx.calls, 1);
  gate.resolve({ ok: true }); await Promise.all([p, q]);
  s.ctx.gate = deferred();
  const failed = s.api.runAutomaticNotificationsSingleFlight(s.admin);
  const joined = s.api.runAutomaticNotificationsSingleFlight(s.admin);
  s.ctx.gate.reject(Error('mock query failure'));
  await assert.rejects(failed, /mock query/); await assert.rejects(joined, /mock query/);
  s.ctx.gate = deferred();
  const retry = s.api.runAutomaticNotificationsSingleFlight(s.admin);
  s.ctx.gate.resolve({ ok: true }); await retry;
  assert.equal(s.ctx.calls, 3);
});
test('authorization still precedes joining an in-flight run; manual resend is separate', async () => {
  const s = setup(), gate = deferred();
  s.ctx.gate = gate; s.ctx.calls = 0;
  vm.runInContext('executeAutomaticNotificationRun=async()=>{calls++;return await gate.promise}', s.ctx);
  const req = (secret, mode) => ({ method: 'POST', headers: new Headers(secret ? { 'x-notification-worker-secret': secret } : {}), text: async () => JSON.stringify({ mode }) });
  const p = s.ctx.handler(req('test-secret', 'send_notifications'));
  const q = s.ctx.handler(req('test-secret', 'run_now'));
  await tick(); assert.equal(s.ctx.calls, 1);
  assert.equal((await s.ctx.handler(req('wrong', 'send_notifications'))).status, 403);
  assert.equal((await s.ctx.handler(req(null, 'send_notifications'))).status, 401);
  const resend = s.ctx.handler(req('test-secret', 'resend_all'));
  await tick(); assert.equal(s.ctx.calls, 2);
  gate.resolve({ ok: true, summary: { sent: 0, failed: 0, skipped: 0 } });
  for (const response of await Promise.all([p, q, resend])) assert.equal(response.status, 200);
});
test('test email avoids recipient tables and still uses explicit address', async () => {
  const s = setup();
  await s.api.sendTestEmail(s.admin, { to: 'test@example.test' });
  assert.equal(recipientReads(s).length, 0);
  assert.equal(s.mails[0].to, 'test@example.test');
});
test('Electron polling does not overlap, waits for cleanup, and retries next tick', async () => {
  const src = readFileSync(electronUrl, 'utf8');
  const snippet = src.slice(src.indexOf('let notificationTimer = null;'), src.indexOf('function computeAutoRunKey'));
  const gate = deferred(), calls = [0, 0, 0];
  const ctx = vm.createContext({
    maybeAutoSendNotifications: async () => { calls[0]++; throw Error('mock failure') },
    maybeAutoPurgeNotificationLogs: async () => { calls[1]++; await gate.promise },
    maybeAutoPurgeAuditLogs: async () => { calls[2]++ },
  });
  vm.runInContext(snippet, ctx);
  const poll = vm.runInContext('pollNotifications', ctx);
  const first = poll(); await tick(); await poll();
  assert.deepEqual(calls, [1, 1, 1]);
  gate.resolve(); await first; await poll();
  assert.deepEqual(calls, [2, 2, 2]);
  assert.match(src, /NOTIFICATION_TIMER_INTERVAL_MS = 60 \* 1000/);
});
