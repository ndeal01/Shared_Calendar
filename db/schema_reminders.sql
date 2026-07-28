-- Reminder feature for Shared Calendar.
-- Run this AFTER schema_tasks.sql. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Events: how many minutes before an occurrence's start time to remind.
--   null = no reminder
--   0    = remind right at start time
--   30   = remind 30 minutes before (default), in 5-minute increments
-- ---------------------------------------------------------------------------
alter table public.events add column if not exists reminder_minutes_before integer default 30
  check (reminder_minutes_before is null or (reminder_minutes_before >= 0 and reminder_minutes_before % 5 = 0));

-- ---------------------------------------------------------------------------
-- Notifications: distinguish reminder rows from task-completion rows, and
-- guard against inserting the same reminder twice (e.g. two open tabs both
-- polling, or a page reload right after a reminder fires).
-- ---------------------------------------------------------------------------
alter table public.notifications add column if not exists type text not null default 'general'
  check (type in ('general', 'reminder'));

create unique index if not exists notifications_unique_reminder
  on public.notifications (user_id, event_id, occurrence_date)
  where type = 'reminder';
