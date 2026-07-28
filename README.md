# Family Calendar (PWA)

Scaffolded Vite + React project with Tailwind and PWA basics.

Next steps (run locally):

1. Ensure Node.js and npm are installed.
2. Install dependencies:

   npm install

3. Initialize Tailwind (if needed) and build/dev:

   npm run dev

4. Set environment variables for Postgres in a .env file at project root:

   DATABASE_URL=postgres://user:pass@localhost:5432/family_calendar

5. Apply the DB schema and optional demo seed:

   psql $DATABASE_URL -f db/schema_postgres.sql
   psql $DATABASE_URL -f db/seed_demo.sql   # optional demo data

   For the Supabase-backed normalized schema run (in the Supabase SQL editor or via psql):

   psql $DATABASE_URL -f db/schema_normalized.sql
   psql $DATABASE_URL -f db/schema_auth.sql        # adds real auth + family sharing (required for sign up/sign in)
   psql $DATABASE_URL -f db/schema_tasks.sql       # adds to-do events, recurrence, and notifications
   psql $DATABASE_URL -f db/schema_reminders.sql   # adds event reminders
   psql $DATABASE_URL -f db/supabase_schema.sql    # optional legacy shared-state table

   `db/schema_auth.sql` adds:
   - `family_users` — links Supabase Auth users to the families they belong to (with `owner`/`member` role)
   - `families.owner_id` — tracks who created each family
   - Per-family RLS policies on `families`, `members`, `events`, and `event_assignments` (replacing the earlier permissive demo policies)
   - `get_family_by_invite_code()` — a safe lookup function used by the "join with invite code" flow

   `db/schema_tasks.sql` adds:
   - `events.is_task` + `events.recurrence_*` columns — mark an event as a to-do item and/or give it a repeat rule (daily/weekly/monthly, every N units, specific weekdays, optional end date)
   - `members.user_id` — optionally links a member profile to a real signed-in account, so they can receive notifications
   - `event_completions` — tracks which specific occurrence date of a task was completed, and by whom
   - `notifications` — in-app notifications (e.g. "Alex completed Take out trash"), scoped so users only see their own

   `db/schema_reminders.sql` adds:
   - `events.reminder_minutes_before` — how long before an event's start time to remind the assigned member(s) (defaults to 30, `0` = at start time, `null` = no reminder). Configurable per-event in 5-minute increments from the event form.
   - `notifications.type` — distinguishes `'reminder'` rows from general/task-completion notifications, with a partial unique index so the same reminder is never inserted twice
   - Reminders are in-app only for now (checked client-side every 60s while the app is open); no push notifications or server-side cron yet.

   In the Supabase dashboard, also make sure **Email** auth is enabled under Authentication → Providers. If you'd like users to skip email confirmation while testing, disable "Confirm email" under Authentication → Settings.

   For the password-reset flow to work, add `<your-app-url>/reset-password` (and `http://localhost:5173/reset-password` for local dev) to Authentication → URL Configuration → Redirect URLs.

6. Start the example server (demo of setting app.current_user_id):

   cd server
   npm install express pg dotenv body-parser
   node example_server.js

   Example requests (use the demo user id from seed):
     GET http://localhost:4000/events?as_user=11111111-1111-1111-1111-111111111111
     POST http://localhost:4000/join  { "invite_code": "SMITH123", "user_id": "11111111-1111-1111-1111-111111111111", "display_name": "Alice" }

Notes:
- npm wasn't available in the environment where scaffolding ran, so dependencies were not installed here. Run `npm install` locally.
- The repository includes a PWA-ready vite.config.js using vite-plugin-pwa; icons (pwa-192x192.png, pwa-512x512.png) should be added to the project root or public folder.
- The Postgres RLS policy requires the application to set the session variable `app.current_user_id` for the current authenticated user. The example server shows how to set it per-transaction using `set_config`.

## Authentication and family sharing

When `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are set, the app uses real Supabase Auth (email + password):

- **Sign up** creates a Supabase Auth user. If email confirmation is enabled on the project, the user must confirm before signing in.
- After signing in, a user with no family yet is routed to **Set up your family calendar**, where they can:
  - **Create a family** — generates a 6-character invite code and makes the user the `owner`.
  - **Join with an invite code** — looks up the family by code and adds the user as a `member`.
- The invite code is shown (with a copy button) on the **Settings** page so an owner can share it with other family members.
- Anyone can **leave** a family from Settings, which returns them to the setup screen.
- All calendar data (members, events, assignments) is scoped per-family via Postgres row-level security — a signed-in user can only read/write data for families they belong to.

If Supabase env vars are not configured, the app falls back to a local-only demo session (no password, stored in `localStorage`) so it still works out of the box.
