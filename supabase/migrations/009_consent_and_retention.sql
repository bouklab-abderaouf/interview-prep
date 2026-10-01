-- Production readiness phase 5 (GDPR).

-- Consent to send the CV, the job description and interview audio to
-- Google's Gemini API, given on the upload page before any analysis.
-- `version` names the wording agreed to (lib/legal.ts), so a later change
-- of wording can ask again.
alter table profiles
  add column ai_processing_consent_at timestamptz,
  add column ai_processing_consent_version text;

-- Retention for data users never see. User content (CVs, roadmaps,
-- interviews) is kept until the user deletes it, as the upload page says;
-- these are the rows that would otherwise pile up forever:
-- - demo sessions: an IP hash kept only to enforce the per-IP hourly cap;
-- - user_daily_usage: per-day counters, useless after the day is over.
-- Run daily by /api/cron/retention with the service role.
create function run_retention(p_demo_days int default 30, p_usage_days int default 30)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_demo  int;
  v_usage int;
begin
  delete from sessions
   where user_id is null
     and started_at < now() - make_interval(days => p_demo_days);
  get diagnostics v_demo = row_count;

  delete from user_daily_usage
   where day < (now() at time zone 'utc')::date - p_usage_days;
  get diagnostics v_usage = row_count;

  return jsonb_build_object('demo_sessions', v_demo, 'usage_rows', v_usage);
end;
$$;

revoke execute on function run_retention(int, int) from public, anon, authenticated;
grant execute on function run_retention(int, int) to service_role;
