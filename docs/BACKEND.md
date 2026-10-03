# Nemora Backend Architecture & Migration Guide 🌊

Welcome to the Nemora backend! This document is designed for **Mujtaba** (Frontend) and **Ameen** (Backend) to get up to speed in under 5 minutes.

---

## 1. Why Did We Move from Express/Railway to Supabase?

Previously, Nemora ran on a single Node/Express server on Railway with:
- In-memory carbon statistics that were erased whenever the server restarted or went to sleep.
- No database or persistent storage for users, challenges, or user garden growth.
- An expired hosting plan that brought down the entire site.

Because the frontend is a **Next.js static export** hosted on GitHub Pages (`nemora.tech`), it has no Node runtime of its own. **Supabase** gives us:
1. **Persistent PostgreSQL database** with built-in Row Level Security (RLS).
2. **Deno Edge Functions** running globally with zero server maintenance.
3. **Real-time subscriptions** for instant garden and leaderboard updates.
4. **Client-side zero-latency CO2 estimation**, eliminating costly round-trips for simple prompt typing.

---

## 2. Shared Carbon Model & The 100ms Rule

All carbon calculations are unified in:
* Edge Functions: `supabase/functions/_shared/co2.ts`
* Frontend: `nemora-frontend-main/lib/co2.ts`

### Why Is `analyze` Computed on the Client?
In the old backend, typing every character or word sent a `POST /api/v1/analyze` to Railway. This caused UI sluggishness and wasted network bandwidth. 

Now, the client computes tokens and estimated grams of CO2 instantaneously in the browser:
$$\text{Tokens} = \lceil \text{word count} \times 1.3 \rceil$$
$$\text{CO}_2\ (\text{g}) = \text{Tokens} \times 0.0003\ \text{kWh/token} \times 0.45\ \text{kg CO}_2\text{e/kWh}$$

### Cutoff Thresholds
* **Green (Eco):** $\le 0.010\text{g CO}_2$ (~25 tokens)
* **Yellow (Moderate):** $> 0.010\text{g}$ and $\le 0.050\text{g CO}_2$
* **Red (Heavy):** $> 0.050\text{g CO}_2$ (Gauge warns user to optimize)

---

## 3. Database Schema at a Glance (`0001_init.sql`)

* **`profiles`**: Stores user identity, coins, total CO2 saved, and optimizations count.
* **`prompt_events`**: Audit log of successful optimizations. **Privacy First:** Raw prompt text is *never* stored—only token counts and carbon metrics.
* **`daily_challenges`**: Code optimization challenges for the Arena.
* **`challenge_submissions`**: Tracks best scores per user per challenge.
* **`rate_limits`**: Atomic 1-minute window counters (10 requests/minute limit per user/IP).

### Views
* `leaderboard`: Ranks users by efficiency ($\text{total CO}_2\text{ saved} / \text{optimizations}$).
* `garden_daily`: 30-day daily aggregates powering the 3D visual garden.
* `global_stats`: Site-wide metrics and mature tree absorption equivalents ($\text{CO}_2 / 21000$).

---

## 4. Edge Functions (`supabase/functions/`)

All Edge Functions run on Deno/TypeScript, enforce CORS for `nemora.tech` and `localhost:3000`, and validate input sizes.

| Function | Method | Auth | Description |
| :--- | :--- | :--- | :--- |
| `optimize` | `POST` | Optional | Calls OpenRouter AI to compress prompts. If authenticated, calls `award_progress` to credit coins ($1\text{ coin} / 0.001\text{g saved}$). Rate limited to 10/min. |
| `submit-challenge` | `POST` | Required | Static pattern analyzer for code submissions (evaluates `Promise.all`, caching, batching). Saves the user's best score. |
| `stats` | `GET` | Public | Returns global platform stats with a 30-second cache. |

### Upstream AI Model Note
`google/gemini-2.0-flash-lite-001` has been deprecated upstream. The system now defaults to `google/gemini-2.0-flash-001` (configured via the `OPENROUTER_MODEL` secret).

---

## 5. Security & Invariant Rules (Important!)

> [!CAUTION]
> **Never Trust the Client with Economy Values**
> 1. Clients **cannot** directly insert into `prompt_events` or write to `coins`, `total_co2_saved`, or `prompts_optimized`.
> 2. The database trigger `protect_profile_economy` automatically throws an error if any non-service-role attempts to modify economy fields.
> 3. Scores and coins are awarded **only** through the `award_progress` function, which is executable solely by the service role inside Edge Functions.
> 4. **Never put `SUPABASE_SERVICE_ROLE_KEY` or `OPENROUTER_API_KEY` into frontend `.env` files.**

---

## 6. How to Run Locally

### Frontend:
```bash
cd nemora-frontend-main
npm install
npm run dev
```

### Local Supabase (Optional for local testing):
```bash
supabase start
supabase functions serve
```
