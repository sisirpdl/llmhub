create table if not exists public.issue_reports (
  id uuid primary key,
  created_at timestamptz not null default now(),
  title text not null check (char_length(title) between 1 and 120),
  description text not null check (char_length(description) between 1 and 4000),
  steps text not null default '' check (char_length(steps) <= 2000),
  diagnostics jsonb
);
create index if not exists issue_reports_created_at_idx on public.issue_reports(created_at);
alter table public.issue_reports enable row level security;
revoke all on public.issue_reports from anon, authenticated;
grant select, insert on public.issue_reports to service_role;

-- Transactional global admission cap, with idempotency checked before charging retries.
-- This is a volume bound, not user authentication or a complete anti-bot solution.
create or replace function public.submit_issue_report(p_id uuid, p_title text, p_description text, p_steps text, p_diagnostics jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare existing public.issue_reports; total integer;
begin
  perform pg_advisory_xact_lock(724761018);
  select * into existing from public.issue_reports where id = p_id;
  if found then
    if existing.title is distinct from p_title or existing.description is distinct from p_description or existing.steps is distinct from p_steps or existing.diagnostics is distinct from p_diagnostics then
      raise exception 'REPORT_ID_CONFLICT' using errcode = 'P0001';
    end if;
    return existing.id;
  end if;
  select count(*) into total from public.issue_reports where created_at > now() - interval '1 hour';
  if total >= 100 then raise exception 'REPORT_RATE_LIMIT' using errcode = 'P0001'; end if;
  insert into public.issue_reports(id,title,description,steps,diagnostics) values (p_id,p_title,p_description,p_steps,p_diagnostics);
  return p_id;
end;
$$;
revoke all on function public.submit_issue_report(uuid,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.submit_issue_report(uuid,text,text,text,jsonb) to service_role;
