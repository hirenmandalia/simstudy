-- SimStudy project store (see src/lib/store/supabase.ts).
-- Only the server reaches these tables: RLS is on with no policies, and the
-- browser-facing roles have no grants.

create table if not exists public.projects (
  id          text primary key,
  owner_id    text not null,
  name        text not null,
  stage       text not null,
  created_at  timestamptz not null,
  updated_at  timestamptz not null,
  data        jsonb not null
);
create index if not exists projects_owner_updated on public.projects (owner_id, updated_at desc);

create table if not exists public.shares (
  token       text primary key,
  owner_id    text not null,
  project_id  text not null references public.projects (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists shares_project on public.shares (project_id);

alter table public.projects enable row level security;
alter table public.shares enable row level security;
revoke all on public.projects, public.shares from anon, authenticated;

-- Private bucket for uploaded screenshots (5 MB each; images are resized before upload).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('screens', 'screens', false, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;
