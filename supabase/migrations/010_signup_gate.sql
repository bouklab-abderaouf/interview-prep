-- Production readiness phase 7: staged launch. Sign-ups can be open, limited
-- to an allow-list (stage A, private beta) or closed (stage B, public demo
-- only). Existing users can always sign in — this only gates *new* users.
--
-- A trigger on auth.users rather than an app check, because sign-up happens
-- between the browser and Supabase directly (signInWithOtp creates the user);
-- the app never sees it. Default 'open', so nothing changes until the mode is
-- switched (docs/RUNBOOK.md, "Sign-ups").

create table app_settings (
  key   text primary key,
  value text not null
);
alter table app_settings enable row level security;   -- no policies: SQL editor / service role only

insert into app_settings (key, value) values ('signups', 'open');

create table signup_allowlist (
  email    text primary key check (email = lower(email)),
  added_at timestamptz not null default now(),
  note     text
);
alter table signup_allowlist enable row level security;   -- no policies: SQL editor / service role only

create function enforce_signup_policy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode text;
begin
  select value into v_mode from app_settings where key = 'signups';
  v_mode := coalesce(v_mode, 'open');

  if v_mode = 'open' then
    return new;
  end if;
  if v_mode = 'allowlist' and exists (select 1 from signup_allowlist where email = lower(new.email)) then
    return new;
  end if;
  -- Surfaces to the client as "Database error saving new user";
  -- components/auth/SignInForm.tsx turns that into a sentence.
  raise exception 'signups_closed' using errcode = 'P0001';
end;
$$;

revoke execute on function enforce_signup_policy() from public, anon, authenticated;

create trigger enforce_signup_policy
  before insert on auth.users
  for each row execute function enforce_signup_policy();
