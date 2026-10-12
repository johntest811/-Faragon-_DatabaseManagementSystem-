# Loading and Supabase Usage Update

## Changes

- Initial client-data loading uses the shared loading circle; existing rows stay
  available during background refreshes. Failed requests finish loading and show
  errors instead of leaving a spinner indefinitely.
- Top-navigation fallback polling is every 120 seconds instead of 15 seconds:
  87.5% fewer timer-driven refresh rounds, not a promise of 87.5% lower billing.
  Realtime updates remain enabled, use one channel, refresh only affected widgets,
  and coalesce bursts. Hidden/offline tabs do not poll; resuming refreshes stale data.
- Concurrent identical Data API reads share one HTTP request. Authorization and
  query headers are part of the key. Completed results and permissions are not
  cached. Cancellable requests remain independent.
- Transient Data API read failures retry at most once, with a 30-second timeout
  per attempt. Rate-limit Retry-After and short outage cooldowns prevent request
  storms. Writes, Auth calls and email/function calls are not automatically
  retried by this transport, to avoid duplicate side effects.
- Role verification no longer immediately queries the same administrator twice.
- Dashboard realtime events are batched by affected section. Bulk updates no
  longer start overlapping statistics/history fetches. Hidden/offline refreshes
  wait for resume, and paginated statistics use stable primary-key ordering.
- Desktop notification cycles cannot overlap. Edge-worker automatic runs share
  in-flight work within an isolate and read only needed recipient lists. Database
  delivery claims still handle cross-device/isolate duplicates. Sender settings,
  recipient rules, manual resend and the one-minute cron schedule are preserved.

## Database Timeout and Screenshot

The screenshot shows a TCP connection timeout in Supabase itself, not an expired
browser request. Increasing the application's timeout cannot repair an unreachable
database. The usage screenshot says quotas have not been exceeded; log ingestion
is elevated, but this does not establish the cause of the database outage.

1. Check project status, database health/CPU/memory/connections, and the Supabase
   status page. Check whether the project is paused or undergoing maintenance.
2. Once SQL Editor connects, run `SQL/supabase_usage_diagnostics.sql`. It is
   read-only and shows connection counts, table sizes and index definitions.
3. Inspect the optional cron/statements queries in that file to identify duplicate
   notification jobs or high-frequency query fingerprints. Do not expose query
   contents or credentials in support screenshots.
4. If the listed indexes are missing, run `SQL/supabase_usage_indexes.sql` during
   a quiet period. It reuses earlier migration names, has lock/statement timeouts,
   and does not delete data or loosen RLS. Index construction can briefly block
   writes. A timeout rolls back the transaction; investigate before retrying.
5. If the dashboard cannot connect at all, use Supabase support before attempting
   schema changes or repeatedly invoking the notification worker.

Do not disable auditing, remove sent-email claims, delete delivery history, or
relax RLS to reduce usage. Log ingestion and database table storage are different
metrics; deleting application logs is not a guaranteed ingestion-quota fix.

## Release and Verification

From `DatabaseManagement`, run `npm.cmd test`, `npm.cmd run build`, and
`npm.cmd run lint`. The regression command runs all 52 targeted tests for the
job-title catalog, Supabase transport, role verification, notification worker
and Dashboard refresh queue.
Database and SMTP operations in these tests are mocked, not live integration tests.
Then redeploy the website and rebuild the desktop installer with a new release
version. The backend-worker optimization requires deploying
`supabase/functions/notification-worker`; changing frontend files does not deploy
that function. Keep its existing authentication and secret configuration.

Compare Supabase request counts, query statistics and usage trends after release.
No live database changes, real emails or cloud deployments are part of local
verification. Test authorization, imports/exports and notifications on staging.
The local production build generates all 33 pages successfully. The unpacked
desktop packaging check does not certify installer upgrades or interactive UI
behavior. The local Electron renderer exits before the responsive UI test can
complete, so mobile/tablet visual verification remains outstanding.

Local verification on 2026-10-12:
- `npm.cmd test`: 52 passed, zero failed (including six refresh-queue tests).
- `node node_modules/eslint/bin/eslint.js . --quiet`: zero lint errors.
- `npm.cmd run build`: TypeScript and all 33 generated pages passed.
- Unpublished, unsigned Windows x64 unpacked packaging passed. `app.asar` is
  28.9 MiB (not the size of the complete Electron app or installer). Supabase,
  updater, mail and spreadsheet runtime dependencies are present. Android and
  Capacitor are absent from the archive.
- `git diff --check`: passed with the repository's normal CRLF settings.

## Table Removal Audit

The screenshot listing pg_stat_statements, pg_net and pg_cron confirms installed
extensions only. Keep these installed; it is not a usage/performance report.

`npm.cmd run audit:table-usage` scans the 57 tables in the supplied schema snapshot
against frontend, Electron, Edge Function and SQL sources. It outputs file paths,
not credentials or function bodies. Text matches are conservative review hints,
not proof that a table is actively used or safe to remove.

Two tables have no literal runtime-source references, but are NOT approved for
removal:
- `notification_delivery_claims` is used indirectly by notification RPCs to
  prevent duplicate deliveries. Removing it would break sending coordination.
- `admin_role_memberships` appears in older permission RPC definitions and
  security migrations. Its live functions, data and supported older clients
  must be checked before considering retirement.

No table was established as safe to drop, so no DROP migration was generated.
Run `SQL/supabase_table_usage_audit.sql` in SQL Editor to inspect sizes, scan/write
counters, foreign keys, catalog dependencies, possible function references and
duplicate active cron schedules. It is read-only and assumes pg_cron is installed,
as shown in the screenshot. Run individual SELECT statements if the editor only
displays the last result. Zero rows/scans are not evidence of no usage, since
statistics can reset and background jobs may run infrequently. Function-body
references may not be recorded in pg_depend, so catalog checks alone are not
enough: https://www.postgresql.org/docs/current/ddl-depend.html

Compare request counts and query-statistic deltas over comparable workloads after
deploying. Indexes can improve query execution but do not eliminate HTTP polling
or reset accumulated log ingestion. The new read-only audit SQL has not been run
against production; live measurements and dependency results are still needed.

## Windows and Native Android

The supported build must not be described as working on every desktop. Electron
22 was the last Windows 7-compatible line and is end-of-life. Tailwind v4 targets
newer browsers than Electron 22's Chromium. The separate `dist:win7` configuration
is retained with an explicit warning, but it is not a verified or secure Windows
7 production build. A proper legacy port requires separate dependency/CSS work
and testing on actual Windows 7 hardware, not just an installer switch.
The production browser targets now match Tailwind v4's minimum browser baseline
(Chromium 111, Firefox 128 and Safari 16.4); browserslist cannot polyfill unsupported
CSS features for Windows 7's older browser engine.

Capacitor integration is removed and Android is excluded from web/desktop builds.
Physical deletion of `android` is still blocked by the execution policy in this
workspace; the folder remains on disk. The responsive web frontend is retained.

Sources:
- https://www.electronjs.org/blog/windows-7-to-8-1-deprecation-notice
- https://tailwindcss.com/docs/compatibility
- https://supabase.com/docs/guides/troubleshooting/failed-to-run-sql-query-connection-terminated-due-to-connection-timeout
