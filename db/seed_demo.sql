-- Demo seed data for Family Calendar
-- Run this after applying db/schema_postgres.sql

-- Use fixed UUIDs for demo convenience
-- Replace or remove IDs for real deployments

-- Demo user
INSERT INTO users (id, email, display_name)
VALUES ('11111111-1111-1111-1111-111111111111', 'alice@example.com', 'Alice')
ON CONFLICT DO NOTHING;

-- Demo family
INSERT INTO families (id, name, invite_code)
VALUES ('22222222-2222-2222-2222-222222222222', 'The Smiths', 'SMITH123')
ON CONFLICT DO NOTHING;

-- Demo members: Alice is admin
INSERT INTO members (id, family_id, user_id, display_name, color, role)
VALUES ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Alice', '#ef4444', 'admin')
ON CONFLICT DO NOTHING;

-- Demo events
INSERT INTO events (id, family_id, title, description, start_time, end_time, all_day, created_by)
VALUES
  ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'Family Dinner', 'Dinner at home', now() + interval '2 days', now() + interval '2 days' + interval '2 hours', false, '33333333-3333-3333-3333-333333333333'),
  ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', 'Grocery Run', 'Quick store trip', now() + interval '1 day', now() + interval '1 day' + interval '1 hour', false, '33333333-3333-3333-3333-333333333333')
ON CONFLICT DO NOTHING;

-- Assign Alice to both events
INSERT INTO event_members (event_id, member_id) VALUES
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333'),
  ('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333')
ON CONFLICT DO NOTHING;

-- End of seed
