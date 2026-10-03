-- Per-user daily limits on everything that spends Gemini quota (gap
-- analysis, scoring, Live tokens) and on session creation. Without them one
-- signed-in account could burn the whole free-tier day for everyone — the
-- text model allows 20 requests per model per day in total.
--
-- Counting happens in the database so it is atomic across serverless
-- instances. The route handlers call consume_user_quota through the user's
-- own (RLS-respecting) client: the user is always auth.uid(), never a
-- parameter, so nobody can spend or inspect someone else's allowance.

create table user_daily_usage (
  user_id  uuid not null references auth.users on delete cascade,
  day      date not null,
  kind     text not null check (kind in ('analysis', 'scoring', 'interview_token', 'drill_token', 'session_create')),
  count    int  not null default 0 check (count >= 0),
  primary key (user_id, day, kind)
);

alter table user_daily_usage enable row level security;

-- Read-only for the owner (the UI may show "2 of 3 analyses left").
-- No insert/update/delete policies: writes only go through the functions
-- below.
create policy "read own usage" on user_daily_usage
  for select using (auth.uid() = user_id);

-- Atomically takes one unit of `p_kind` for today (UTC) if the caller is
-- under `p_max`. Returns true when allowed. SECURITY DEFINER because the
-- table has no write policies; the caller's identity still comes from
-- auth.uid(). A user calling this directly can only spend their own
-- allowance — the limit that matters is the one the server passes.
create function consume_user_quota(p_kind text, p_max int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_count int;
begin
  if v_user is null then
    raise exception 'consume_user_quota: not authenticated' using errcode = '28000';
  end if;
  if p_max <= 0 then
    return false;
  end if;

  insert into user_daily_usage as u (user_id, day, kind, count)
  values (v_user, (now() at time zone 'utc')::date, p_kind, 1)
  on conflict (user_id, day, kind)
    do update set count = u.count + 1
    where u.count < p_max
  returning count into v_count;

  return v_count is not null;
end;
$$;

revoke execute on function consume_user_quota(text, int) from public, anon;
grant execute on function consume_user_quota(text, int) to authenticated;

-- Gives back one unit when the spend didn't happen for reasons outside the
-- user's control (Gemini 503/429, a failed token mint). Service role only:
-- if users could call it they could reset their own counter forever.
create function release_user_quota(p_user uuid, p_kind text)
returns void
language sql
security invoker
set search_path = public
as $$
  update user_daily_usage
     set count = count - 1
   where user_id = p_user
     and day = (now() at time zone 'utc')::date
     and kind = p_kind
     and count > 0;
$$;

revoke execute on function release_user_quota(uuid, text) from public, anon, authenticated;
grant execute on function release_user_quota(uuid, text) to service_role;
