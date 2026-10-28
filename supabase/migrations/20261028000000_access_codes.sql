-- Activation codes (see src/lib/codes.ts). Only a SHA-256 hash of each code is
-- stored. Server-only, like the store tables: RLS on, no policies, no grants.

create table if not exists public.access_codes (
  id                text primary key,
  hash              text not null unique,
  label             text,
  cap_usd           numeric(10, 2) not null,
  created_at        timestamptz not null,
  expires_at        timestamptz not null,
  disabled_at       timestamptz,
  last_used_at      timestamptz,
  project_id        text,
  study_deleted_at  timestamptz
);

-- Failed code entries, for rate limiting. Rows older than a day are pruned.
create table if not exists public.code_attempts (
  id   bigint generated always as identity primary key,
  key  text not null,
  at   timestamptz not null default now()
);
create index if not exists code_attempts_key_at on public.code_attempts (key, at);
create index if not exists code_attempts_at on public.code_attempts (at);

alter table public.access_codes enable row level security;
alter table public.code_attempts enable row level security;
revoke all on public.access_codes, public.code_attempts from anon, authenticated;
