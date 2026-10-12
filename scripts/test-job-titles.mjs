import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/app/Client/jobTitles.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { loadJobTitles, saveJobTitle, removeJobTitle, normalizeJobTitle } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

// A persistent fake Data API exercises the same query chains used by both pages.
function database(initial = [], options = {}) {
  const rows = structuredClone(initial);
  let writes = 0;
  let reads = 0;
  return {
    rows,
    get writes() { return writes; },
    get reads() { return reads; },
    from(table) {
      assert.equal(table, "job_titles", "Catalog edits must not change employee records");
      let operation;
      let payload;
      let id;
      const query = {
        select() { return query; },
        order() { return query; },
        async range(start, end) {
          reads++;
          if (options.readError) return { data: null, error: options.readError };
          return { data: structuredClone(rows.slice(start, end + 1)), error: null };
        },
        insert(value) { operation = "insert"; payload = value; return query; },
        update(value) { operation = "update"; payload = value; return query; },
        eq(column, value) { assert.equal(column, "title_id"); id = value; return query; },
        async single() {
          if (options.writeError) return { data: null, error: options.writeError };
          if (options.networkError) throw new Error("Network unavailable");
          writes++;
          if (options.race && operation === "insert") {
            rows.push({ title_id: "winner", ...payload });
            return { data: null, error: { code: "23505", message: "Duplicate title" } };
          }
          if (operation === "insert") {
            const row = { title_id: `new-${rows.length}`, ...payload };
            rows.push(row);
            return { data: structuredClone(row), error: null };
          }
          const row = rows.find((item) => item.title_id === id);
          if (!row || options.filteredByRls) return { data: null, error: { code: "PGRST116", message: "No rows" } };
          Object.assign(row, payload);
          return { data: structuredClone(row), error: null };
        },
      };
      return query;
    },
  };
}

test("normalizes case and whitespace; rejects blank titles", async () => {
  assert.equal(normalizeJobTitle("  Lady \t Guard  "), "LADY GUARD");
  await assert.rejects(saveJobTitle(database(), " \t "), /Enter a job title/);
});

test("add, reload, remove, reload and reactivate preserve the catalog ID", async () => {
  const db = database();
  const created = await saveJobTitle(db, "  Security   Officer ");
  assert.equal(created.title, "SECURITY OFFICER");
  assert.equal((await loadJobTitles(db))[0].is_active, true);
  await removeJobTitle(db, created.title_id);
  assert.equal((await loadJobTitles(db)).filter((row) => row.is_active).length, 0);
  const restored = await saveJobTitle(db, "security officer");
  assert.equal(restored.title_id, created.title_id);
  assert.equal(restored.is_active, true);
  assert.equal(db.rows.length, 1);
});

test("existing mixed-case choice uses its actual select value without duplicate inserts", async () => {
  const db = database([{ title_id: 5, title: "Lady Guard", is_active: true }]);
  const found = await saveJobTitle(db, " LADY  GUARD ");
  assert.equal(found.title, "Lady Guard");
  assert.equal(db.writes, 0);
});

test("RLS zero-row updates are errors, not successful deletions", async () => {
  const db = database([{ title_id: "a", title: "GUARD", is_active: true }], { filteredByRls: true });
  await assert.rejects(removeJobTitle(db, "a"), /not saved/);
  assert.equal(db.rows[0].is_active, true);
});

test("permission denial is actionable and does not persist a local-only option", async () => {
  const db = database([], { writeError: { code: "42501", message: "denied" } });
  await assert.rejects(saveJobTitle(db, "GUARD"), /write permission/);
  assert.equal(db.rows.length, 0);
});

test("missing catalog identifies the required migration instead of rebuilding from employees", async () => {
  const db = database([], { readError: { code: "PGRST205", message: "missing table" } });
  await assert.rejects(loadJobTitles(db), /supabase_fix_job_title_catalog.sql/);
});

test("loads more than one API page without losing job titles", async () => {
  const db = database(Array.from({ length: 1001 }, (_, i) => ({ title_id: i, title: `TITLE ${i}`, is_active: true })));
  assert.equal((await loadJobTitles(db)).length, 1001);
  assert.equal(db.reads, 3);
});

test("concurrent duplicate creation uses the winning persisted title", async () => {
  const db = database([], { race: true });
  assert.equal((await saveJobTitle(db, "GUARD")).title_id, "winner");
  assert.equal(db.rows.length, 1);
});

test("network failure is surfaced without pretending an item was created", async () => {
  const db = database([], { networkError: true });
  await assert.rejects(saveJobTitle(db, "GUARD"), /Network unavailable/);
  assert.equal(db.rows.length, 0);
});

test("SQL Editor and CLI migration copies stay identical", () => {
  const editor = readFileSync(new URL("../SQL/supabase_fix_job_title_catalog.sql", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/migrations/20261007000000_fix_job_title_catalog.sql", import.meta.url), "utf8");
  assert.equal(editor, migration);
  assert.match(editor, /if seed_catalog then/);
  assert.match(editor, /enable row level security/);
  assert.doesNotMatch(editor, /using \(true\)|with check \(true\)/i);
});
