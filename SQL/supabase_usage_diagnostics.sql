-- READ ONLY. Run in Supabase SQL Editor once database connectivity is restored.
-- A TCP CONNECT_TIMEOUT cannot be repaired by SQL that cannot reach the server.
-- No credentials, record contents, policies, jobs or retained logs are changed.

select now() as checked_at, current_database() as database_name,
  pg_size_pretty(pg_database_size(current_database())) as database_size;

select usename, application_name, state, wait_event_type, count(*) as connections
from pg_stat_activity
where datname = current_database()
group by usename, application_name, state, wait_event_type
order by connections desc;

select schemaname, relname, n_live_tup as estimated_rows, n_dead_tup as estimated_dead_rows,
  seq_scan, idx_scan, last_autovacuum, last_autoanalyze,
  pg_size_pretty(pg_total_relation_size(relid)) as total_size
from pg_stat_user_tables
order by pg_total_relation_size(relid) desc
limit 25;

select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('applicants', 'admins', 'audit_log', 'contracts',
    'licensure_notification_log', 'other_expiration_notification_log',
    'contract_expiration_notification_log')
order by tablename, indexname;

-- Confirm installed extensions before using the optional queries below.
select e.extname, e.extversion, n.nspname as extension_schema
from pg_extension e
join pg_namespace n on n.oid = e.extnamespace
where e.extname in ('pg_stat_statements', 'pg_cron', 'pg_net');

-- If pg_cron is installed, check for duplicated notification schedules.
-- Do not automatically delete jobs or change sending times.
-- select jobid, jobname, schedule, active from cron.job
-- where jobname ilike '%notification%';
-- select jobid, status, count(*) as runs
-- from cron.job_run_details where start_time > now() - interval '24 hours'
-- group by jobid, status order by runs desc;

-- If pg_stat_statements is installed in extensions, identify expensive query
-- fingerprints without exposing SQL text or customer data. Stats are cumulative
-- since the last reset; compare two snapshots to measure this deployment.
-- select queryid, calls, round(total_exec_time::numeric, 2) as total_ms,
--   round(mean_exec_time::numeric, 2) as mean_ms, rows
-- from extensions.pg_stat_statements order by total_exec_time desc limit 20;
