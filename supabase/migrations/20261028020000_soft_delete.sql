-- Deleting a study hides it from its user but keeps it for the operator
-- (see src/lib/store/supabase.ts). Every user-facing query filters on this.
alter table public.projects add column if not exists deleted_at timestamptz;
create index if not exists projects_owner_live on public.projects (owner_id, updated_at desc) where deleted_at is null;
