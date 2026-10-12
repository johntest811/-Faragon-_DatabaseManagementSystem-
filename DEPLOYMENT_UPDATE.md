# Job Titles, Responsive Web, and Desktop Size Update

## Apply the database change first

Run the entire `SQL/supabase_fix_job_title_catalog.sql` file in the Supabase SQL
Editor. Alternatively, apply its identical CLI migration
`supabase/migrations/20261007000000_fix_job_title_catalog.sql`. Do not run the
schema-reference file `Supabase_database.sql` as a migration.

The migration requires the existing production-auth migrations. It creates a
persistent job-title catalog, seeds existing workforce positions once, and
permits changes only for authenticated users with Applicants or Employees write
access. Superadmin access is handled by the existing authorization helper.
It does not grant anonymous access or change employee positions.

Delete hides a job title from future choices. Existing employee records keep
their positions. Adding the same title again restores the catalog choice. Case
and whitespace differences do not create additional active choices.

## Build and release

Run commands from `DatabaseManagement`:

```powershell
npm.cmd ci --include=dev
npm.cmd run test:job-titles
npm.cmd run build
npm.cmd run test:responsive
```

`test:responsive` uses a hidden Electron window with production CSS and shared
layout classes. It checks six viewport sizes without signing in or touching
production records. It requires a working local Electron runtime; it is not a
replacement for real-device testing.

Vercel must install development dependencies to build Next.js. If overriding the
Vercel install command, use `npm ci --include=dev`; build with `npm run build`.
The application still generates the same static `out` directory. Redeploy to
publish the web changes; local edits do not update the live site automatically.

For desktop, assign a new release version before publishing an auto-update,
then run `npm.cmd run dist:modern`. The existing installer is not changed by a
web build. Browser-only libraries are build dependencies now, so Electron does
not package a second Node.js copy alongside the compiled web application. Its
Supabase, mail, update, and spreadsheet main-process dependencies remain runtime
dependencies. Do not omit development dependencies until after building.

## Native mobile retirement

Capacitor configuration and dependencies have been removed. The phone/tablet
experience is now the responsive website, not a separately built Android app.
The old `android` directory is excluded from Vercel, TypeScript, ESLint, and
desktop packaging. Automated deletion of that directory was blocked in this
workspace; it still occupies disk space and can be removed manually when no
Android development tools are using it.

## Release checks

Verify on staging before publishing:

- In Applicants and Employees, add a title, reopen the form, delete it, reopen
  again, and confirm it stays removed. Restore it by adding the same title.
- Check a read-only account cannot change the catalog, and saved employee
  positions are unchanged when their catalog choice is removed.
- On phones/tablets, open and close the navigation drawer, notifications, and
  employee editor. Check horizontal table swipes and vertical page scrolling.
- Verify login, PDF/XLSX export, and email sending in the newly packaged desktop
  app and the redeployed website. These tests are not exercised against your
  live database by the offline regression suite.

No claim is made that every device, Windows version, or production account has
been tested. Modern supported browsers and the supported Electron runtime are
required; the legacy Windows build remains separate.

## Local verification results

- Passed all 10 catalog regression tests, TypeScript, and project ESLint error
  checks. Production build generated all 33 pages.
- Unpacked Windows packaging passed using the installed Electron distribution
  with publishing/signing disabled for this smoke test. Verified Supabase,
  updater, mail, and main-process XLSX dependencies inside the archive.
- The new application archive is 28.9 MiB versus 320.8 MiB in the previous local
  `dist` archive. This compares application archives, not full installer sizes.
- The responsive geometry runner could not complete in this environment because
  Electron's renderer/GPU subprocess failed to initialize. Real phone/tablet
  testing remains outstanding. No live database migration or deployment was
  performed, and the native Android folder could not be physically deleted.
