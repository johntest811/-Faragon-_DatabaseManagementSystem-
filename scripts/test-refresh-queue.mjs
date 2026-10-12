import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/app/Client/refreshQueue.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 },
}).outputText;
const { createRefreshQueue } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('bulk events coalesce and only refresh affected dashboard sections', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let employees = 0, contracts = 0;
  const queue = createRefreshQueue({
    employees: async () => { employees++; }, contracts: async () => { contracts++; },
  });
  t.after(() => queue.dispose());
  for (let i = 0; i < 100; i++) queue.request('employees');
  t.mock.timers.tick(500);
  await settle();
  assert.equal(employees, 1);
  assert.equal(contracts, 0);
});

test('events during a request produce one follow-up without overlap', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let release, calls = 0;
  const queue = createRefreshQueue({ employees: async () => {
    calls++;
    if (calls === 1) await new Promise((resolve) => { release = resolve; });
  } });
  t.after(() => queue.dispose());
  queue.request('employees');
  t.mock.timers.tick(500);
  await settle();
  for (let i = 0; i < 10; i++) queue.request('employees');
  t.mock.timers.tick(5000);
  assert.equal(calls, 1);
  release();
  await settle();
  t.mock.timers.tick(500);
  await settle();
  assert.equal(calls, 2);
});

test('hidden/offline work waits for resume and keeps queued changes', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let active = false, calls = 0;
  const queue = createRefreshQueue({ data: async () => { calls++; } }, { isActive: () => active });
  t.after(() => queue.dispose());
  queue.request('data');
  t.mock.timers.tick(1000);
  await settle();
  assert.equal(calls, 0);
  active = true;
  queue.resume();
  active = false;
  t.mock.timers.tick(500);
  await settle();
  assert.equal(calls, 0);
  active = true;
  queue.resume();
  t.mock.timers.tick(500);
  await settle();
  assert.equal(calls, 1);
});

test('failed tasks do not prevent later refreshes or sibling tasks', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let failures = 0, successes = 0;
  const queue = createRefreshQueue({
    failed: async () => { throw Error('offline'); },
    good: async () => { successes++; },
  }, { onError: () => { failures++; } });
  t.after(() => queue.dispose());
  queue.request('failed', 'good');
  t.mock.timers.tick(500);
  await settle();
  queue.request('good');
  t.mock.timers.tick(500);
  await settle();
  assert.equal(failures, 1);
  assert.equal(successes, 2);
});

test('unmount cancels pending timers and ignores subsequent events', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const queue = createRefreshQueue({ data: async () => { calls++; } });
  queue.request('data');
  queue.dispose();
  queue.request('data');
  queue.resume();
  t.mock.timers.tick(5000);
  await settle();
  assert.equal(calls, 0);
});

test('unmount during a request prevents queued follow-ups', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let release, calls = 0;
  const queue = createRefreshQueue({ data: async () => {
    calls++;
    await new Promise((resolve) => { release = resolve; });
  } });
  queue.request('data');
  t.mock.timers.tick(500);
  await settle();
  queue.request('data');
  queue.dispose();
  release();
  await settle();
  t.mock.timers.tick(5000);
  await settle();
  assert.equal(calls, 1);
});
