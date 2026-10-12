import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
function sources(directory) {
  return readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const name = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return sources(name);
    return /\.(tsx?|[cm]?js|sql)$/.test(name)
      ? [{ name, text: readFileSync(path.join(root, name), 'utf8') }] : [];
  });
}

const runtime = ['src', 'electron', 'supabase/functions'].flatMap(sources);
const sql = ['SQL', 'supabase/migrations'].flatMap(sources);
const schema = readFileSync(path.join(root, 'Supabase_database.sql'), 'utf8');
const tables = [...schema.matchAll(/CREATE TABLE public\.(\w+)/g)].map((match) => match[1]);
console.log(JSON.stringify({
  warning: 'Conservative text references only, not proof of runtime usage or safe deletion. SQL and deployed clients must also be audited.',
  tableCount: tables.length,
  tables: tables.map((table) => {
    const expression = new RegExp(`\\b${table}\\b`);
    return {
      table,
      runtimeReferences: runtime.filter((file) => expression.test(file.text)).map((file) => file.name),
      sqlReferences: sql.filter((file) => expression.test(file.text)).map((file) => file.name),
    };
  }),
}, null, 2));
