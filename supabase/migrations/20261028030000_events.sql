-- Product events that live outside a study's own record: code entries,
-- study visits, budget blocks and errors (see src/lib/events.ts). No code
-- text, IP addresses or study content is stored here. Server-only.

create table if not exists public.events (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  kind        text not null,
  code_id     text,
  project_id  text,
  detail      jsonb not null default '{}'::jsonb
);
create index if not exists events_at on public.events (at);
create index if not exists events_kind_at on public.events (kind, at);

alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;
