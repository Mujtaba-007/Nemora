-- =============================================================================
-- 0005_reward_dedupe.sql
-- Adds prompt_hash and day_bucket to prompt_events for reward-farming protection.
-- Safe to run once on the existing table (all changes are idempotent).
-- =============================================================================

-- 1. Add prompt_hash column (nullable – existing rows get null, which is fine)
alter table public.prompt_events
  add column if not exists prompt_hash text;

-- 2. Add day_bucket as a generated stored column.
--    prompt_events.created_at is "timestamp with time zone" (timestamptz), so
--    casting to 'UTC' date is immutable once AT TIME ZONE is applied with a
--    literal string. Postgres requires the expression to be IMMUTABLE.
--    We use (created_at at time zone 'UTC')::date which is immutable.
alter table public.prompt_events
  add column if not exists day_bucket date
    generated always as ((created_at at time zone 'UTC')::date) stored;

-- 3. Unique index to prevent a user from earning rewards for the same hash
--    on the same UTC calendar day. The partial index (WHERE prompt_hash IS NOT NULL)
--    means rows with null hashes (legacy rows or guests) are unaffected.
create unique index if not exists uq_prompt_events_user_hash_day
  on public.prompt_events (user_id, prompt_hash, day_bucket)
  where prompt_hash is not null;
