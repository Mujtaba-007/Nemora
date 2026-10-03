-- -----------------------------------------------------------------------------
-- 0004_guest_claims.sql
-- Table to track claimed guest progress tokens and prevent double-claiming or forgery.
-- -----------------------------------------------------------------------------

create table if not exists public.guest_claims (
  claim_id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  tokens_saved int not null check (tokens_saved >= 0),
  co2_saved numeric(12,3) not null check (co2_saved >= 0),
  coins int not null check (coins >= 0),
  claimed_at timestamptz not null default now()
);

-- Index for fast user claim lookups and aggregations
create index if not exists idx_guest_claims_user_id on public.guest_claims(user_id);

-- Enable Row Level Security (RLS)
alter table public.guest_claims enable row level security;

-- Policy: Users can view their own claimed rewards
create policy "Users can view own guest claims"
  on public.guest_claims for select
  using (auth.uid() = user_id);

-- Direct client inserts, updates, and deletes are disabled (no policy for anon or authenticated).
-- Claims can ONLY be inserted by service_role via the claim-guest-progress Edge Function.
