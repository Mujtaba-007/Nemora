-- =============================================================================
-- Nemora Migration: 0002_auth.sql - Custom Username Authentication & Validation
-- =============================================================================

-- 1. Ensure reserved usernames check constraint on profiles
alter table public.profiles drop constraint if exists chk_username_not_reserved;
alter table public.profiles add constraint chk_username_not_reserved check (
  username not in ('admin', 'nemora', 'support', 'root', 'system', 'api', 'auth', 'help', 'moderator')
);

-- 2. Function: is_username_available
-- Checks username format, reserved status, and uniqueness without leaking any personal data.
create or replace function public.is_username_available(p_username text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_username text;
  v_reserved text[] := array['admin', 'nemora', 'support', 'root', 'system', 'api', 'auth', 'help', 'moderator'];
begin
  if p_username is null then
    return false;
  end if;

  v_username := lower(trim(p_username));

  -- Format check: 3-20 lowercase alphanumeric + underscore
  if not (v_username ~ '^[a-z0-9_]{3,20}$') then
    return false;
  end if;

  -- Reserved word check
  if v_username = any(v_reserved) then
    return false;
  end if;

  -- Uniqueness check in profiles
  if exists (select 1 from public.profiles where username = v_username::citext) then
    return false;
  end if;

  return true;
end;
$$;

-- Allow public and authenticated callers to query username availability
grant execute on function public.is_username_available(text) to anon, authenticated, service_role;

-- 3. Trigger: handle_new_user
-- Fails signup cleanly with a descriptive error if the username is missing, invalid, or already taken.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_reserved text[] := array['admin', 'nemora', 'support', 'root', 'system', 'api', 'auth', 'help', 'moderator'];
begin
  v_username := lower(trim(coalesce(new.raw_user_meta_data->>'username', '')));

  -- Validate presence and format
  if v_username is null or not (v_username ~ '^[a-z0-9_]{3,20}$') then
    raise exception 'Invalid username format. Must be 3-20 characters using lowercase letters, numbers, or underscores.'
      using errcode = '23514';
  end if;

  -- Validate reserved names
  if v_username = any(v_reserved) then
    raise exception 'Username is reserved. Please choose another username.'
      using errcode = '23505';
  end if;

  -- Validate uniqueness
  if exists (select 1 from public.profiles where username = v_username::citext) then
    raise exception 'Username already taken.'
      using errcode = '23505';
  end if;

  -- Insert profile
  insert into public.profiles (id, username, coins, total_co2_saved, prompts_optimized)
  values (new.id, v_username::citext, 0, 0, 0);

  return new;
end;
$$;

-- Ensure trigger is active on auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
