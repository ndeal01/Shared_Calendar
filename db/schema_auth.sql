-- Authentication and family sharing schema for Shared Calendar
-- This adds user management, family membership, and the join-by-invite-code
-- flow on top of the normalized schema (db/schema_normalized.sql).
--
-- Run this AFTER schema_normalized.sql. Safe to re-run (idempotent).
--
-- NOTE: if you already ran an earlier version of this file and hit
-- "infinite recursion detected in policy for relation family_users", just run
-- this updated file again — it drops and recreates the family_users policies
-- using non-recursive SECURITY DEFINER helper functions.
--
-- NOTE: if you hit "new row violates row-level security policy for table
-- families" when creating a family, run this updated file again — it fixes
-- select_own_families to also allow the owner to read back their new row
-- immediately after INSERT ... RETURNING (before their family_users
-- membership row exists).

-- Table to track which auth users belong to which families.
-- This is the link between Supabase Auth and our families table.
create table if not exists public.family_users (
  id text primary key default gen_random_uuid()::text,
  family_id text not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text default 'member' check (role in ('owner', 'member')),
  display_name text,
  created_at timestamptz default now(),
  unique(family_id, user_id)
);

-- Track which user owns each family (nice for auditing / future features).
alter table public.families add column if not exists owner_id uuid references auth.users(id) on delete set null;

-- Enable RLS on the new table.
alter table public.family_users enable row level security;

-- Helper functions used by RLS policies below.
-- These run as SECURITY DEFINER so they bypass RLS internally — this is what
-- avoids "infinite recursion detected in policy for relation family_users",
-- which happens if a family_users policy tries to query family_users
-- directly (Postgres re-evaluates the same RLS policy for that inner query).
create or replace function public.is_family_member(target_family_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.family_users
    where family_id = target_family_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_family_owner(target_family_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.family_users
    where family_id = target_family_id and user_id = auth.uid() and role = 'owner'
  );
$$;

revoke all on function public.is_family_member(text) from public;
revoke all on function public.is_family_owner(text) from public;
grant execute on function public.is_family_member(text) to authenticated;
grant execute on function public.is_family_owner(text) to authenticated;

-- Drop any earlier (recursive) versions of these policies before recreating.
drop policy if exists select_family_members on public.family_users;
drop policy if exists insert_family_members on public.family_users;
drop policy if exists delete_family_members on public.family_users;

-- RLS Policies for family_users table — use the helper functions above
-- instead of a self-referencing subquery to avoid recursion.
create policy select_family_members on public.family_users
  for select
  using (public.is_family_member(family_id));

create policy insert_family_members on public.family_users
  for insert
  with check (
    user_id = auth.uid() or public.is_family_owner(family_id)
  );

create policy delete_family_members on public.family_users
  for delete
  using (
    user_id = auth.uid() or public.is_family_owner(family_id)
  );

-- RLS Policies for families table.
-- Users can only SELECT families they already belong to (see the
-- get_family_by_invite_code() function below for the join-by-code lookup,
-- which deliberately bypasses this restriction in a narrow, safe way).
--
-- Drop and recreate select_own_families so re-running this file after the
-- earlier version picks up the owner_id fix below (see NOTE further down).
drop policy if exists select_own_families on public.families;

create policy select_own_families on public.families
  for select
  using (
    public.is_family_member(id)
    -- Allows the creator to read back the row immediately after INSERT
    -- ...RETURNING, before their family_users membership row exists (it's
    -- created in a second step, once the family id exists to reference).
    or owner_id = auth.uid()
  );

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'families' and policyname = 'insert_families'
  ) then
    create policy insert_families on public.families
      for insert
      with check (auth.uid() is not null);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'families' and policyname = 'update_own_families'
  ) then
    create policy update_own_families on public.families
      for update
      using (owner_id = auth.uid());
  end if;
end
$$;

-- RLS Policies for members table - scoped to families the user belongs to.
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'members' and policyname = 'select_family_members'
  ) then
    create policy select_family_members on public.members
      for select
      using (public.is_family_member(family_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'members' and policyname = 'insert_members'
  ) then
    create policy insert_members on public.members
      for insert
      with check (public.is_family_member(family_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'members' and policyname = 'update_members'
  ) then
    create policy update_members on public.members
      for update
      using (public.is_family_member(family_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'members' and policyname = 'delete_members'
  ) then
    create policy delete_members on public.members
      for delete
      using (public.is_family_member(family_id));
  end if;
end
$$;

-- RLS Policies for events table - scoped to families the user belongs to.
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'events' and policyname = 'select_events'
  ) then
    create policy select_events on public.events
      for select
      using (public.is_family_member(family_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'events' and policyname = 'insert_events'
  ) then
    create policy insert_events on public.events
      for insert
      with check (public.is_family_member(family_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'events' and policyname = 'update_events'
  ) then
    create policy update_events on public.events
      for update
      using (public.is_family_member(family_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'events' and policyname = 'delete_events'
  ) then
    create policy delete_events on public.events
      for delete
      using (public.is_family_member(family_id));
  end if;
end
$$;

-- RLS Policies for event_assignments table - scoped via the parent event's family.
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'event_assignments' and policyname = 'select_assignments'
  ) then
    create policy select_assignments on public.event_assignments
      for select
      using (
        event_id in (
          select id from public.events where public.is_family_member(family_id)
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'event_assignments' and policyname = 'insert_assignments'
  ) then
    create policy insert_assignments on public.event_assignments
      for insert
      with check (
        event_id in (
          select id from public.events where public.is_family_member(family_id)
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'event_assignments' and policyname = 'delete_assignments'
  ) then
    create policy delete_assignments on public.event_assignments
      for delete
      using (
        event_id in (
          select id from public.events where public.is_family_member(family_id)
        )
      );
  end if;
end
$$;

-- Secure lookup for "join family by invite code".
-- RLS on `families` normally hides rows the user isn't a member of yet, so a
-- plain SELECT can't find a family to join. This SECURITY DEFINER function
-- runs with elevated privilege but only ever returns the single row matching
-- the exact invite code passed in — it never exposes the full families table.
create or replace function public.get_family_by_invite_code(code text)
returns table (id text, name text, invite_code text)
language sql
security definer
set search_path = public
as $$
  select f.id, f.name, f.invite_code
  from public.families f
  where f.invite_code = code;
$$;

revoke all on function public.get_family_by_invite_code(text) from public;
grant execute on function public.get_family_by_invite_code(text) to authenticated;

-- Drop the old permissive demo policies from schema_normalized.sql now that
-- real per-family RLS policies are in place above.
drop policy if exists allow_public on public.families;
drop policy if exists allow_public on public.members;
drop policy if exists allow_public on public.events;
drop policy if exists allow_public on public.event_assignments;
