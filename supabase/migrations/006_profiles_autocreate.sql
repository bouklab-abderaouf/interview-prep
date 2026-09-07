-- specs §3 defines a profiles table (total_xp, streak_days, last_active) and
-- an "own profile" RLS policy, but nothing ever creates a row — so Phase 4's
-- XP bar and streak counter had nowhere to read from. Standard Supabase
-- pattern: a trigger on auth.users. SECURITY DEFINER is required here (the
-- insert runs as the auth admin role, where auth.uid() isn't the new user,
-- so RLS would otherwise block it); execute is revoked from the client-facing
-- roles as defense-in-depth since it lives in the exposed public schema.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill anyone who signed up before this trigger existed.
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;
