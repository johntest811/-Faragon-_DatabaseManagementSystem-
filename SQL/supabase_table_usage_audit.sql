-- READ ONLY: inspect production dependencies before considering table removal.
-- Run in Supabase SQL Editor. This script drops nothing and changes no policies.
-- Zero scans or zero rows do NOT prove a table is unused: statistics can reset,
-- and jobs, RPCs, integrations, or older desktop clients may still depend on it.
begin read only;
set local statement_timeout = '30s';

select now() as inspected_at, stats_reset
from pg_stat_database where datname = current_database();

select s.relname as table_name, s.n_live_tup as estimated_rows,
  s.seq_scan, s.idx_scan, s.n_tup_ins, s.n_tup_upd, s.n_tup_del,
  pg_size_pretty(pg_total_relation_size(s.relid)) as total_size,
  c.relrowsecurity as rls_enabled
from pg_stat_user_tables s
join pg_class c on c.oid = s.relid
where s.schemaname = 'public'
order by pg_total_relation_size(s.relid) desc, s.relname;

-- Incoming foreign keys, including tables in other schemas.
select target.relname as referenced_table,
  source_ns.nspname as dependent_schema, source.relname as dependent_table,
  constraint_row.conname as foreign_key
from pg_constraint constraint_row
join pg_class target on target.oid = constraint_row.confrelid
join pg_namespace target_ns on target_ns.oid = target.relnamespace
join pg_class source on source.oid = constraint_row.conrelid
join pg_namespace source_ns on source_ns.oid = source.relnamespace
where constraint_row.contype = 'f' and target_ns.nspname = 'public'
order by referenced_table, dependent_schema, dependent_table;

-- Catalog-tracked dependencies: views, policies, triggers, and other objects.
select distinct target.relname as referenced_table,
  pg_describe_object(d.classid, d.objid, d.objsubid) as dependent_object,
  d.deptype as dependency_type
from pg_depend d
join pg_class target on target.oid = d.refobjid
join pg_namespace ns on ns.oid = target.relnamespace
where d.refclassid = 'pg_class'::regclass
  and ns.nspname = 'public' and target.relkind in ('r', 'p')
order by referenced_table, dependent_object;

-- Text matches supplement pg_depend for string-bodied SQL/PLpgSQL functions.
-- These are review hints (including possible comments), not definitive usage.
-- Function bodies are deliberately NOT returned because they may contain secrets.
select distinct target.relname as possible_referenced_table,
  function_ns.nspname as function_schema, routine.proname as function_name,
  pg_get_function_identity_arguments(routine.oid) as arguments
from pg_class target
join pg_namespace table_ns on table_ns.oid = target.relnamespace
join pg_proc routine on strpos(lower(routine.prosrc), lower(target.relname)) > 0
join pg_namespace function_ns on function_ns.oid = routine.pronamespace
where table_ns.nspname = 'public' and target.relkind in ('r', 'p')
  and function_ns.nspname in ('public', 'private')
order by possible_referenced_table, function_schema, function_name;

-- pg_cron is installed in your screenshot. Job commands are not exposed.
-- Duplicate fingerprints require review; never delete schedules automatically.
select jobname, schedule, active from cron.job order by jobname;
select schedule, count(*) as identical_active_jobs
from cron.job where active
group by schedule, command, database, username
having count(*) > 1;

commit;

-- Before any DROP: verify actual data, live dependencies, job execution history,
-- supported desktop versions and backups. Test removal on staging first.
-- Never use DROP ... CASCADE as an automatic "optimization".
