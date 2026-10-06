-- =============================================================================
-- supabase/manual/reset_user_economy.sql
--
-- DO NOT RUN THIS SCRIPT AUTOMATICALLY.
-- Run it manually in the Supabase SQL editor with full admin (service_role) access.
--
-- Purpose: Reset all economy columns for a specific user, identified by username.
-- The user is looked up by username — never pass a raw UUID directly.
-- All changes run inside a transaction so they either all succeed or all roll back.
-- =============================================================================

begin;

do $$
declare
  v_user_id uuid;
begin
  -- 1. Resolve username → id
  --    Replace 'the_username_to_reset' with the actual username before running.
  select id
  into   v_user_id
  from   public.profiles
  where  username = 'the_username_to_reset'::citext;

  if v_user_id is null then
    raise exception 'User not found: the_username_to_reset';
  end if;

  -- 2. Reset economy columns on profiles
  update public.profiles
  set
    coins             = 0,
    total_co2_saved   = 0,
    prompts_optimized = 0
  where id = v_user_id;

  -- 3. Delete all prompt_events for this user
  delete from public.prompt_events
  where user_id = v_user_id;

  -- 4. Delete all guest_claims for this user
  delete from public.guest_claims
  where user_id = v_user_id;

  raise notice 'Economy reset complete for user id=%', v_user_id;
end;
$$;

commit;
