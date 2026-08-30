-- specs §5.3 step 5 — atomic increment so concurrent demo requests can't
-- race and lose a count. SECURITY INVOKER (default): the service-role client
-- already bypasses RLS, so no elevation is needed; execute is still revoked
-- from anon/authenticated as defense-in-depth since this lives in the
-- PostgREST-exposed public schema.
create function increment_demo_sessions(p_day date)
returns void
language sql
set search_path = public
as $$
  insert into usage_counters (day, demo_sessions)
  values (p_day, 1)
  on conflict (day) do update set demo_sessions = usage_counters.demo_sessions + 1;
$$;

revoke execute on function increment_demo_sessions(date) from public;
grant execute on function increment_demo_sessions(date) to service_role;
