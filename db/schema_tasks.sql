-- Tasks, recurring events, and notifications for Shared Calendar.
-- Run this AFTER schema_normalized.sql and schema_auth.sql. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Events: add to-do + recurrence fields
-- ---------------------------------------------------------------------------
alter table public.events add column if not exists is_task boolean not null default false;

-- Recurrence rule (kept simple/flat rather than full iCal RRULE):
--   recurrence_freq:          'none' | 'daily' | 'weekly' | 'monthly'
--   recurrence_interval:      repeat every N units (e.g. 2 = "every 2 weeks")
--   recurrence_days_of_week:  for weekly rules only; 0=Sun .. 6=Sat, e.g. {1,3,5} = Mon/Wed/Fri
--   recurrence_end_date:      last date an occurrence may fall on (inclusive); null = open-ended
alter table public.events add column if not exists recurrence_freq text not null default 'none'
  check (recurrence_freq in ('none', 'daily', 'weekly', 'monthly'));
alter table public.events add column if not exists recurrence_interval integer not null default 1
  check (recurrence_interval >= 1);
alter table public.events add column if not exists recurrence_days_of_week integer[];
alter table public.events add column if not exists recurrence_end_date date;

-- ---------------------------------------------------------------------------
-- Members: optionally link a member profile to a real signed-in account.
-- This is what lets us notify "everyone assigned" — a member with no linked
-- account just doesn't receive in-app notifications.
-- ---------------------------------------------------------------------------
alter table public.members add column if not exists user_id uuid references auth.users(id) on delete set null;

-- A given account should only be linked to one member profile per family.
create unique index if not exists members_family_user_unique
  on public.members (family_id, user_id)
  where user_id is not null;

-- ---------------------------------------------------------------------------
-- Per-occurrence completion state for task events.
-- occurrence_date is the specific calendar date being completed — for a
-- one-off event this is just its `date`; for a recurring event it's whichever
-- generated occurrence was checked off.
-- ---------------------------------------------------------------------------
create table if not exists public.event_completions (
  event_id text not null references public.events(id) on delete cascade,
  occurrence_date date not null,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz not null default now(),
  primary key (event_id, occurrence_date)
);

alter table public.event_completions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'event_completions' and policyname = 'select_completions'
  ) then
    create policy select_completions on public.event_completions
      for select
      using (
        event_id in (select id from public.events where public.is_family_member(family_id))
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'event_completions' and policyname = 'insert_completions'
  ) then
    create policy insert_completions on public.event_completions
      for insert
      with check (
        event_id in (select id from public.events where public.is_family_member(family_id))
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'event_completions' and policyname = 'delete_completions'
  ) then
    create policy delete_completions on public.event_completions
      for delete
      using (
        event_id in (select id from public.events where public.is_family_member(family_id))
      );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- In-app notifications.
-- Inserted client-side when a task is completed, one row per assigned member
-- who has a linked account (see members.user_id above).
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id text primary key default gen_random_uuid()::text,
  family_id text not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id text references public.events(id) on delete cascade,
  occurrence_date date,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

do $$
begin
  -- Recipients can only see and manage (mark read) their own notifications.
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'notifications' and policyname = 'select_own_notifications'
  ) then
    create policy select_own_notifications on public.notifications
      for select
      using (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'notifications' and policyname = 'update_own_notifications'
  ) then
    create policy update_own_notifications on public.notifications
      for update
      using (user_id = auth.uid());
  end if;

  -- Any family member can create a notification for another member of the
  -- same family (e.g. when they complete a shared task).
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'notifications' and policyname = 'insert_family_notifications'
  ) then
    create policy insert_family_notifications on public.notifications
      for insert
      with check (public.is_family_member(family_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'notifications' and policyname = 'delete_own_notifications'
  ) then
    create policy delete_own_notifications on public.notifications
      for delete
      using (user_id = auth.uid());
  end if;
end
$$;

-- Helpful index for the notification bell's unread-count query.
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, read);
