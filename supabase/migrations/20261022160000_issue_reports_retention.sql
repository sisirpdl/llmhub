-- Keep submitted support reports for at most 30 days in the active database.
-- Supabase project owners must also review provider logs and backups separately.
create extension if not exists pg_cron with schema extensions;

create or replace function public.purge_expired_issue_reports()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare deleted_count integer;
begin
  delete from public.issue_reports
  where created_at < now() - interval '30 days';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.purge_expired_issue_reports() from public, anon, authenticated;
grant execute on function public.purge_expired_issue_reports() to service_role;

select cron.unschedule(jobid)
from cron.job
where jobname = 'purge-issue-reports-30-days';

select cron.schedule(
  'purge-issue-reports-30-days',
  '17 3 * * *',
  $$select public.purge_expired_issue_reports();$$
);
