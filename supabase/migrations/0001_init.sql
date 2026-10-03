-- =============================================================================
-- Nemora Supabase Initial Schema Migration: 0001_init.sql
-- =============================================================================
-- Architecture:
-- - Idempotent definitions for all core tables, RLS policies, views, functions, triggers
-- - Strict security boundaries: client cannot manipulate coins, CO2, or score totals
-- - Privacy-first: prompt text is never stored in the database
-- =============================================================================

-- Enable required extensions
create extension if not exists citext with schema public;
create extension if not exists pgcrypto with schema public;

-- -----------------------------------------------------------------------------
-- 1. Profiles Table
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext unique not null check (
    char_length(username) >= 3 and
    char_length(username) <= 20 and
    username ~ '^[a-z0-9_]+$'
  ),
  coins int not null default 0 check (coins >= 0),
  total_co2_saved numeric(12,3) not null default 0 check (total_co2_saved >= 0),
  prompts_optimized int not null default 0 check (prompts_optimized >= 0),
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 2. Prompt Events Table (Audit log for authenticated optimizations)
-- Note: Raw prompt text is intentionally omitted to respect user privacy.
-- -----------------------------------------------------------------------------
create table if not exists public.prompt_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  strategy text not null check (strategy in ('compress', 'facts-only', 'bullets')),
  original_tokens int not null check (original_tokens >= 0),
  optimized_tokens int not null check (optimized_tokens >= 0),
  original_co2 numeric(12,3) not null check (original_co2 >= 0),
  optimized_co2 numeric(12,3) not null check (optimized_co2 >= 0),
  co2_saved numeric(12,3) not null check (co2_saved >= 0),
  coins_awarded int not null check (coins_awarded >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_prompt_events_user_created 
  on public.prompt_events (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 3. Daily Challenges Table
-- -----------------------------------------------------------------------------
create table if not exists public.daily_challenges (
  id uuid primary key default gen_random_uuid(),
  challenge_date date unique not null,
  title text not null,
  description text not null,
  starter_code text not null,
  max_score int not null default 100 check (max_score > 0),
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 4. Challenge Submissions Table (Keeps each user's best score)
-- -----------------------------------------------------------------------------
create table if not exists public.challenge_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  challenge_id uuid not null references public.daily_challenges(id) on delete cascade,
  code text not null,
  score int not null check (score >= 0 and score <= 100),
  created_at timestamptz not null default now(),
  constraint uq_user_challenge unique (user_id, challenge_id)
);

create index if not exists idx_challenge_submissions_lookup 
  on public.challenge_submissions (challenge_id, score desc);

-- -----------------------------------------------------------------------------
-- 5. Rate Limits Table (Used by Edge Functions for 1-minute window throttling)
-- -----------------------------------------------------------------------------
create table if not exists public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 1,
  primary key (key, window_start)
);

-- Function to atomically increment rate limit counters
create or replace function public.increment_rate_limit(
  p_key text,
  p_window_start timestamptz
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.rate_limits (key, window_start, count)
  values (p_key, p_window_start, 1)
  on conflict (key, window_start)
  do update set count = rate_limits.count + 1
  returning count into v_count;

  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Trigger: Automatically provision profile on auth.users registration
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw_username text;
  v_username text;
begin
  v_raw_username := lower(trim(coalesce(new.raw_user_meta_data->>'username', '')));
  
  if v_raw_username ~ '^[a-z0-9_]{3,20}$' then
    v_username := v_raw_username;
  else
    v_username := 'user_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;

  insert into public.profiles (id, username)
  values (new.id, v_username::citext)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 7. Economy Protection Function & Trigger
-- Enforces that clients CANNOT update coins, total_co2_saved, or prompts_optimized.
-- -----------------------------------------------------------------------------
create or replace function public.protect_profile_economy()
returns trigger
language plpgsql
security definer
as $$
begin
  -- If invoked by normal client role, prevent modification of economy columns
  if coalesce(auth.jwt()->>'role', '') != 'service_role' and current_user != 'postgres' then
    if new.coins is distinct from old.coins or
       new.total_co2_saved is distinct from old.total_co2_saved or
       new.prompts_optimized is distinct from old.prompts_optimized then
      raise exception 'Direct modification of economy columns (coins, total_co2_saved, prompts_optimized) is forbidden.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tr_protect_profile_economy on public.profiles;
create trigger tr_protect_profile_economy
  before update on public.profiles
  for each row execute function public.protect_profile_economy();

-- -----------------------------------------------------------------------------
-- 8. Stored Procedure: award_progress
-- Privileged procedure for Edge Functions to credit CO2 savings and coins.
-- -----------------------------------------------------------------------------
create or replace function public.award_progress(
  p_user_id uuid,
  p_co2_saved numeric,
  p_coins int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set
    coins = coins + greatest(0, p_coins),
    total_co2_saved = total_co2_saved + greatest(0, p_co2_saved),
    prompts_optimized = prompts_optimized + 1
  where id = p_user_id;
end;
$$;

revoke execute on function public.award_progress(uuid, numeric, int) from public, anon, authenticated;
grant execute on function public.award_progress(uuid, numeric, int) to service_role;

-- -----------------------------------------------------------------------------
-- 9. Views
-- -----------------------------------------------------------------------------

-- Global Leaderboard (Exposes only non-sensitive columns)
create or replace view public.leaderboard as
select
  p.username,
  p.coins,
  p.total_co2_saved,
  p.prompts_optimized,
  coalesce(round(p.total_co2_saved / nullif(p.prompts_optimized, 0), 3), 0)::numeric(12,3) as efficiency
from public.profiles p
order by efficiency desc, p.total_co2_saved desc
limit 100;

-- Garden Daily Aggregates (security_invoker = true so RLS applies to underlying prompt_events)
create or replace view public.garden_daily
with (security_invoker = true) as
select
  pe.user_id,
  date_trunc('day', pe.created_at)::date as day,
  coalesce(sum(pe.co2_saved), 0)::numeric(12,3) as co2_saved,
  count(*)::int as optimizations_count
from public.prompt_events pe
where pe.created_at >= (now() - interval '30 days')
group by pe.user_id, date_trunc('day', pe.created_at)::date
order by day asc;

-- Global Platform Statistics
-- Note: trees_equivalent uses the legacy constant of 21,000g (21kg) CO2 absorbed by one mature tree/year.
create or replace view public.global_stats as
select
  coalesce(sum(p.total_co2_saved), 0)::numeric(12,3) as total_co2_saved,
  coalesce(sum(p.prompts_optimized), 0)::int as total_optimizations,
  count(p.id)::int as total_users,
  coalesce(round(sum(p.total_co2_saved) / 21000.0, 6), 0)::numeric(12,6) as trees_equivalent
from public.profiles p;

-- -----------------------------------------------------------------------------
-- 10. Row Level Security (RLS) Policies
-- -----------------------------------------------------------------------------

-- Profiles
alter table public.profiles enable row level security;

create policy "Profiles public read"
  on public.profiles for select
  using (true);

create policy "Users can update non-economy fields of own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Prompt Events
alter table public.prompt_events enable row level security;

create policy "Users can select own prompt events"
  on public.prompt_events for select
  using (auth.uid() = user_id);

-- Daily Challenges
alter table public.daily_challenges enable row level security;

create policy "Daily challenges public read"
  on public.daily_challenges for select
  using (true);

-- Challenge Submissions
alter table public.challenge_submissions enable row level security;

create policy "Users can select own challenge submissions"
  on public.challenge_submissions for select
  using (auth.uid() = user_id);

-- Rate Limits
alter table public.rate_limits enable row level security;
-- No client policies created for rate_limits: only accessible via service_role

-- -----------------------------------------------------------------------------
-- 11. Realtime Publication
-- -----------------------------------------------------------------------------
alter table public.profiles replica identity full;
alter table public.prompt_events replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'prompt_events'
  ) then
    alter publication supabase_realtime add table public.prompt_events;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 12. Seed Default Challenge
-- -----------------------------------------------------------------------------
insert into public.daily_challenges (
  challenge_date,
  title,
  description,
  starter_code,
  max_score
)
values (
  current_date,
  'Optimize API Calls',
  'Reduce the number of API calls by implementing efficient caching and batching',
  '// Optimize this function
async function fetchData(ids) {
  const results = [];
  for (const id of ids) {
    const res = await fetch(`/api/item/${id}`);
    results.push(await res.json());
  }
  return results;
}',
  100
)
on conflict (challenge_date) do nothing;
