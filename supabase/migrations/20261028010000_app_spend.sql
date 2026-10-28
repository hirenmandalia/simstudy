-- App-wide AI spend per calendar month (see src/lib/spend.ts), for the monthly
-- cap. Server-only: RLS on, no policies, no grants.

create table if not exists public.app_spend (
  month       text primary key,
  usd         numeric(12, 4) not null default 0,
  updated_at  timestamptz not null default now()
);

alter table public.app_spend enable row level security;
revoke all on public.app_spend from anon, authenticated;
