-- PostgreSQL schema for Family Calendar (using Postgres, not Supabase)
-- File: db/schema_postgres.sql
--
-- Instructions:
-- 1. The application MUST set the session variable `app.current_user_id` to the
--    current user's UUID (text) for row-level security (RLS) to work.
--    Example (per-connection or per-transaction):
--      SELECT set_config('app.current_user_id', 'USER-UUID-HERE', true);
--    or in libpq/pg drivers set session parameter after auth.
--
-- 2. Run this file as a privileged DB user to create extensions/functions/tables.
-- 3. For admin tasks (bypassing RLS), connect as a DB role that is granted
--    BYPASSRLS or temporarily set the app.current_user_id to the admin's UUID
--    depending on your access model.

-- Enable pgcrypto for gen_random_uuid() and cryptographic helpers
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create application schema for helper functions
CREATE SCHEMA IF NOT EXISTS app;

-- Helper function: returns current app user id as uuid or NULL
CREATE OR REPLACE FUNCTION app.current_app_user_id() RETURNS uuid LANGUAGE plpgsql STABLE AS $$
DECLARE
  uid_text text := current_setting('app.current_user_id', true);
BEGIN
  IF uid_text IS NULL OR uid_text = '' THEN
    RETURN NULL;
  END IF;
  RETURN uid_text::uuid;
END;
$$;

-- Users table (optional; depends on how you manage authentication)
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  display_name text,
  created_at timestamptz DEFAULT now()
);

-- Families table
CREATE TABLE IF NOT EXISTS families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  invite_code text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Invite code generation helper
CREATE OR REPLACE FUNCTION app.generate_invite_code() RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  code text;
BEGIN
  LOOP
    code := substring(md5(random()::text), 1, 8);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM families WHERE invite_code = code);
  END LOOP;
  RETURN code;
END;
$$;

-- Trigger to set invite_code if not provided
CREATE OR REPLACE FUNCTION app.set_family_invite_code() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.invite_code IS NULL OR NEW.invite_code = '' THEN
    NEW.invite_code := app.generate_invite_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS families_set_invite_code ON families;
CREATE TRIGGER families_set_invite_code
BEFORE INSERT ON families
FOR EACH ROW EXECUTE FUNCTION app.set_family_invite_code();

-- Members table: links users to families and stores display preferences
CREATE TABLE IF NOT EXISTS members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  display_name text,
  color text,
  role text DEFAULT 'member', -- 'admin' | 'member'
  created_at timestamptz DEFAULT now(),
  UNIQUE (family_id, user_id)
);

-- Events table
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  location text,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  all_day boolean DEFAULT false,
  recurrence_rule text,
  created_by uuid REFERENCES members(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Event assignments (many-to-many event <-> member)
CREATE TABLE IF NOT EXISTS event_members (
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, member_id)
);

-- Indexes for queries
CREATE INDEX IF NOT EXISTS idx_events_family_start ON events (family_id, start_time);
CREATE INDEX IF NOT EXISTS idx_members_family ON members (family_id);

-- Row-Level Security (RLS)
-- Enable RLS on tables that should be restricted by family membership.

ALTER TABLE families ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_members ENABLE ROW LEVEL SECURITY;

-- Helper function: checks whether the current app user is a member of the given family
CREATE OR REPLACE FUNCTION app.is_member_of_family(fam uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM members m
    WHERE m.family_id = fam
      AND m.user_id = app.current_app_user_id()
  );
$$;

-- Families: allow SELECT for members of the family
DROP POLICY IF EXISTS families_select ON families;
CREATE POLICY families_select ON families
  FOR SELECT
  USING (app.is_member_of_family(id));

-- Families: allow INSERT (any authenticated app user can create a family)
DROP POLICY IF EXISTS families_insert ON families;
CREATE POLICY families_insert ON families
  FOR INSERT
  WITH CHECK (app.current_app_user_id() IS NOT NULL);

-- Families: allow UPDATE/DELETE only if the actor is a member and has admin role in that family
DROP POLICY IF EXISTS families_manage ON families;
CREATE POLICY families_manage ON families
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM members m
      WHERE m.family_id = families.id
        AND m.user_id = app.current_app_user_id()
        AND m.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM members m
      WHERE m.family_id = families.id
        AND m.user_id = app.current_app_user_id()
        AND m.role = 'admin'
    )
  );

-- Members: allow SELECT only for members of the same family
DROP POLICY IF EXISTS members_select ON members;
CREATE POLICY members_select ON members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM members m2
      WHERE m2.family_id = members.family_id
        AND m2.user_id = app.current_app_user_id()
    )
  );

-- Members: allow INSERT when the row's user_id matches current app user (joining a family)
DROP POLICY IF EXISTS members_insert ON members;
CREATE POLICY members_insert ON members
  FOR INSERT
  WITH CHECK (user_id = app.current_app_user_id());

-- Members: allow UPDATE/DELETE when the current user is admin in that family or updating their own member row
DROP POLICY IF EXISTS members_manage ON members;
CREATE POLICY members_manage ON members
  FOR UPDATE, DELETE
  USING (
    user_id = app.current_app_user_id()
    OR EXISTS (
      SELECT 1 FROM members m2
      WHERE m2.family_id = members.family_id
        AND m2.user_id = app.current_app_user_id()
        AND m2.role = 'admin'
    )
  )
  WITH CHECK (
    user_id = app.current_app_user_id()
    OR EXISTS (
      SELECT 1 FROM members m2
      WHERE m2.family_id = members.family_id
        AND m2.user_id = app.current_app_user_id()
        AND m2.role = 'admin'
    )
  );

-- Events: allow SELECT/INSERT/UPDATE/DELETE only for users who are members of the event's family
DROP POLICY IF EXISTS events_access ON events;
CREATE POLICY events_access ON events
  FOR ALL
  USING (
    app.is_member_of_family(family_id)
  )
  WITH CHECK (
    app.is_member_of_family(family_id)
  );

-- Event_members: similar access control via the related event -> family
DROP POLICY IF EXISTS event_members_access ON event_members;
CREATE POLICY event_members_access ON event_members
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM events e
      JOIN members m ON m.family_id = e.family_id
      WHERE e.id = event_members.event_id
        AND m.user_id = app.current_app_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events e
      JOIN members m ON m.family_id = e.family_id
      WHERE e.id = event_members.event_id
        AND m.user_id = app.current_app_user_id()
    )
  );

-- Example admin role: create a role 'app_admin' that can bypass RLS if desired (requires SUPERUSER to grant BYPASSRLS)
-- GRANT app_admin TO some_role; -- grant this role to DB users that need to bypass RLS

-- NOTES:
-- - This RLS setup assumes the application sets the session variable 'app.current_user_id'
--   to the authenticated user's UUID. Without it, most queries will return no rows.
-- - For connection pools, ensure the app sets the variable per-transaction using
--     SELECT set_config('app.current_user_id', '<uuid>', true);
--   so it does not leak between pooled clients.
-- - Adjust policies as needed for broader or narrower permissions (e.g., read-only members).

-- End of schema
