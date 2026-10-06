-- =============================================================================
-- 0006_award_progress_with_hash.sql
-- Atomic, race-safe reward crediting with duplicate-prompt detection.
-- Caps are passed as parameters so SQL never hard-codes business rules.
-- Column names verified against 0001_init.sql.
-- =============================================================================

create or replace function public.award_progress_with_hash(
  p_user_id          uuid,
  p_prompt_hash      text,
  p_strategy         text,
  p_original_tokens  int,
  p_optimized_tokens int,
  p_original_co2     numeric,
  p_optimized_co2    numeric,
  p_co2_saved        numeric,
  p_coins            int,
  p_max_events       int,
  p_max_coins        int
)
returns table (awarded boolean, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id          uuid;
  v_event_count int;
  v_coins_sum   int;
  v_today_utc   date := (now() at time zone 'UTC')::date;
begin
  -- Serialize all writes for the same user to prevent races
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  -- 1. Sanity: no positive savings → no award
  if p_co2_saved <= 0 or p_coins <= 0 then
    return query select false, 'NO_SAVINGS'::text;
    return;
  end if;

  -- 2. Duplicate-prompt check (same user + same hash + same UTC calendar day)
  if exists (
    select 1
    from public.prompt_events
    where user_id     = p_user_id
      and prompt_hash = p_prompt_hash
      and day_bucket  = v_today_utc
  ) then
    return query select false, 'DUPLICATE_PROMPT'::text;
    return;
  end if;

  -- 3. Daily cap: rolling 24-hour window
  select
    count(*)::int,
    coalesce(sum(coins_awarded), 0)::int
  into v_event_count, v_coins_sum
  from public.prompt_events
  where user_id   = p_user_id
    and created_at >= now() - interval '24 hours';

  if v_event_count >= p_max_events or (v_coins_sum + p_coins) > p_max_coins then
    return query select false, 'DAILY_CAP_REACHED'::text;
    return;
  end if;

  -- 4. Insert event. ON CONFLICT covers the race where two parallel requests
  --    both pass checks and try to insert simultaneously.
  --    Column names mirror 0001_init.sql exactly.
  insert into public.prompt_events (
    user_id,
    strategy,
    original_tokens,
    optimized_tokens,
    original_co2,
    optimized_co2,
    co2_saved,
    coins_awarded,
    prompt_hash
  ) values (
    p_user_id,
    p_strategy,
    p_original_tokens,
    p_optimized_tokens,
    p_original_co2,
    p_optimized_co2,
    p_co2_saved,
    p_coins,
    p_prompt_hash
  )
  on conflict (user_id, prompt_hash, day_bucket)
    where prompt_hash is not null
  do nothing
  returning id into v_id;

  -- If silently skipped by ON CONFLICT, the reward was already granted today
  if v_id is null then
    return query select false, 'DUPLICATE_PROMPT'::text;
    return;
  end if;

  -- 5. Credit profile, identical approach to the existing award_progress function
  update public.profiles
  set
    coins             = coins             + greatest(0, p_coins),
    total_co2_saved   = total_co2_saved   + greatest(0, p_co2_saved),
    prompts_optimized = prompts_optimized + 1
  where id = p_user_id;

  return query select true, null::text;
end;
$$;

-- Only service_role may invoke this; clients (anon/authenticated) are locked out
revoke all on function public.award_progress_with_hash(
  uuid, text, text, int, int, numeric, numeric, numeric, int, int, int
) from public, anon, authenticated;

grant execute on function public.award_progress_with_hash(
  uuid, text, text, int, int, numeric, numeric, numeric, int, int, int
) to service_role;
