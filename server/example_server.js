/*
  Example Node.js Express server demonstrating how to set the
  `app.current_user_id` session variable per-transaction so Postgres RLS
  policies in db/schema_postgres.sql apply correctly.

  Usage (locally):
    1. Create a .env file with DATABASE_URL (Postgres connection string)
    2. npm install express pg dotenv body-parser
    3. node server/example_server.js

  Endpoints included:
    POST /impersonate  -- set a demo current_user_id for subsequent requests (in-memory only)
    POST /families     -- create a family (must send {name})
    POST /join         -- join a family by invite_code (must send {invite_code, user_id, display_name})
    GET  /events       -- list events for the current_user (RLS enforced)

  Important: This example explicitly sets the session variable per-transaction
  using client.query("SELECT set_config('app.current_user_id', $1, true);").
  When using connection pools, always set the variable at the start of each
  transaction or query so it does not leak between requests.
*/

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');

const app = express();
app.use(bodyParser.json());

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Middleware to attach a demo currentUser (for example/testing only).
// In real app, derive user ID from authentication (JWT/session) and set req.currentUserId.
app.use((req, res, next) => {
  // For demo, you can pass ?as_user=1111... in query, or set header 'x-demo-user'
  req.currentUserId = req.query.as_user || req.headers['x-demo-user'] || null;
  next();
});

// Basic validation helpers (lightweight, keep dependencies small)
function validateFamilyPayload(body) {
  const errors = [];
  if (!body || typeof body.name !== 'string' || body.name.trim() === '') errors.push('name is required');
  return { ok: errors.length === 0, errors };
}

function validateJoinPayload(body) {
  const errors = [];
  if (!body || typeof body.invite_code !== 'string' || body.invite_code.trim() === '') errors.push('invite_code is required');
  if (!body || typeof body.user_id !== 'string' || body.user_id.trim() === '') errors.push('user_id is required');
  return { ok: errors.length === 0, errors };
}

function validateEventCreatePayload(body) {
  const errors = [];
  if (!body) {
    errors.push('body is required');
    return { ok: false, errors };
  }
  if (!body.family_id || typeof body.family_id !== 'string') errors.push('family_id is required');
  if (!body.title || typeof body.title !== 'string') errors.push('title is required');
  if (!body.start_time) errors.push('start_time is required');
  if (!body.end_time) errors.push('end_time is required');
  // simple time ordering check if both provided
  if (body.start_time && body.end_time) {
    const s = new Date(body.start_time);
    const e = new Date(body.end_time);
    if (!(s instanceof Date) || isNaN(s)) errors.push('start_time must be a valid date');
    if (!(e instanceof Date) || isNaN(e)) errors.push('end_time must be a valid date');
    if (s >= e) errors.push('start_time must be before end_time');
  }
  return { ok: errors.length === 0, errors };
}

function validateEventUpdatePayload(body) {
  if (!body) return { ok: false, errors: ['body is required'] };
  const allowed = ['title','description','location','start_time','end_time','all_day','assigned_member_ids'];
  const keys = Object.keys(body);
  if (keys.length === 0) return { ok: false, errors: ['nothing to update'] };
  const invalid = keys.filter(k => !allowed.includes(k));
  if (invalid.length) return { ok: false, errors: [`invalid fields: ${invalid.join(',')}`] };
  if (body.start_time && body.end_time) {
    const s = new Date(body.start_time);
    const e = new Date(body.end_time);
    if (!(s instanceof Date) || isNaN(s)) return { ok: false, errors:['start_time must be a valid date'] };
    if (!(e instanceof Date) || isNaN(e)) return { ok: false, errors:['end_time must be a valid date'] };
    if (s >= e) return { ok: false, errors:['start_time must be before end_time'] };
  }
  return { ok: true, errors: [] };
}

// Helper: run callback in a client where app.current_user_id is set for the session
async function withCurrentUser(clientCallback, currentUserId) {
  const client = await pool.connect();
  try {
    // Set the session variable for this connection (visible in subsequent queries on this connection)
    // Use set_config with is_local = true so it applies to current transaction and won't persist beyond it.
    await client.query("BEGIN");
    if (currentUserId) {
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [currentUserId]);
    } else {
      // unset
      await client.query("SELECT set_config('app.current_user_id', '', true)");
    }

    const result = await clientCallback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Create a family (any authenticated user can create)
app.post('/families', async (req, res) => {
  const { name } = req.body;
  const userId = req.currentUserId;
  if (!userId) return res.status(401).json({ error: 'Missing demo user id (as_user or x-demo-user)' });

  try {
    const result = await withCurrentUser(async (client) => {
      const insertFamily = await client.query(
        `INSERT INTO families (name) VALUES ($1) RETURNING id, name, invite_code`,
        [name]
      );

      // Add the creator as a member with role admin
      const familyId = insertFamily.rows[0].id;
      await client.query(
        `INSERT INTO members (family_id, user_id, display_name, role) VALUES ($1, $2, $3, 'admin') ON CONFLICT DO NOTHING`,
        [familyId, userId, '']
      );

      return insertFamily.rows[0];
    }, userId);

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// Join a family by invite code (inserts into members)
app.post('/join', async (req, res) => {
  const { invite_code, user_id, display_name } = req.body;
  if (!invite_code || !user_id) return res.status(400).json({ error: 'invite_code and user_id required' });

  try {
    const result = await withCurrentUser(async (client) => {
      const fam = await client.query('SELECT id FROM families WHERE invite_code = $1', [invite_code]);
      if (fam.rowCount === 0) throw new Error('Invalid invite code');
      const familyId = fam.rows[0].id;

      const mem = await client.query(
        `INSERT INTO members (family_id, user_id, display_name) VALUES ($1, $2, $3) RETURNING id, family_id, user_id, display_name`,
        [familyId, user_id, display_name || '']
      );
      return mem.rows[0];
    }, user_id);

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// List events visible to the current user (RLS will filter by family membership)
app.get('/events', async (req, res) => {
  const userId = req.currentUserId;
  if (!userId) return res.status(401).json({ error: 'Missing demo user id (as_user or x-demo-user)' });

  try {
    const events = await withCurrentUser(async (client) => {
      const q = await client.query(`SELECT e.* FROM events e ORDER BY e.start_time`);
      return q.rows;
    }, userId);

    res.json(events);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// Get single event by id
app.get('/events/:id', async (req, res) => {
  const userId = req.currentUserId;
  const eventId = req.params.id;
  if (!userId) return res.status(401).json({ error: 'Missing demo user id' });

  try {
    const event = await withCurrentUser(async (client) => {
      const q = await client.query('SELECT e.* FROM events e WHERE e.id = $1', [eventId]);
      if (q.rowCount === 0) return null;
      const membersQ = await client.query('SELECT em.member_id FROM event_members em WHERE em.event_id = $1', [eventId]);
      const row = q.rows[0];
      row.assigned_member_ids = membersQ.rows.map(r => r.member_id);
      return row;
    }, userId);

    if (!event) return res.status(404).json({ error: 'Not found or access denied' });
    res.json(event);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// Create event
app.post('/events', async (req, res) => {
  const userId = req.currentUserId;
  const {
    family_id,
    title,
    description,
    location,
    start_time,
    end_time,
    all_day = false,
    assigned_member_ids = []
  } = req.body;

  if (!userId) return res.status(401).json({ error: 'Missing demo user id' });
  if (!family_id || !title || !start_time || !end_time) return res.status(400).json({ error: 'family_id, title, start_time, end_time required' });

  try {
    const created = await withCurrentUser(async (client) => {
      // Find the member id for the creator within this family
      const mem = await client.query('SELECT id FROM members WHERE family_id = $1 AND user_id = $2 LIMIT 1', [family_id, userId]);
      const created_by = mem.rowCount ? mem.rows[0].id : null;

      const insert = await client.query(
        `INSERT INTO events (family_id, title, description, location, start_time, end_time, all_day, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING *`,
        [family_id, title, description || null, location || null, start_time, end_time, all_day, created_by]
      );

      const eventId = insert.rows[0].id;

      // Insert event_members
      for (const memberId of assigned_member_ids) {
        await client.query('INSERT INTO event_members (event_id, member_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [eventId, memberId]);
      }

      const membersQ = await client.query('SELECT member_id FROM event_members WHERE event_id = $1', [eventId]);
      const result = insert.rows[0];
      result.assigned_member_ids = membersQ.rows.map(r => r.member_id);
      return result;
    }, userId);

    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// Update event
app.put('/events/:id', async (req, res) => {
  const userId = req.currentUserId;
  const eventId = req.params.id;
  const {
    title,
    description,
    location,
    start_time,
    end_time,
    all_day,
    assigned_member_ids
  } = req.body;

  if (!userId) return res.status(401).json({ error: 'Missing demo user id' });

  try {
    const updated = await withCurrentUser(async (client) => {
      // Build dynamic update
      const fields = [];
      const vals = [];
      let idx = 1;
      if (title !== undefined) { fields.push(`title = $${idx++}`); vals.push(title); }
      if (description !== undefined) { fields.push(`description = $${idx++}`); vals.push(description); }
      if (location !== undefined) { fields.push(`location = $${idx++}`); vals.push(location); }
      if (start_time !== undefined) { fields.push(`start_time = $${idx++}`); vals.push(start_time); }
      if (end_time !== undefined) { fields.push(`end_time = $${idx++}`); vals.push(end_time); }
      if (all_day !== undefined) { fields.push(`all_day = $${idx++}`); vals.push(all_day); }
      if (fields.length === 0 && assigned_member_ids === undefined) throw new Error('Nothing to update');

      if (fields.length > 0) {
        // add updated_at
        fields.push(`updated_at = now()`);
        const q = `UPDATE events SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
        vals.push(eventId);
        const r = await client.query(q, vals);
        if (r.rowCount === 0) throw new Error('Not found or access denied');
      }

      if (assigned_member_ids !== undefined) {
        // Replace assignments: simple strategy delete existing and insert new
        await client.query('DELETE FROM event_members WHERE event_id = $1', [eventId]);
        for (const memberId of assigned_member_ids) {
          await client.query('INSERT INTO event_members (event_id, member_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [eventId, memberId]);
        }
      }

      const final = await client.query('SELECT * FROM events WHERE id = $1', [eventId]);
      if (final.rowCount === 0) throw new Error('Not found or access denied');
      const membersQ = await client.query('SELECT member_id FROM event_members WHERE event_id = $1', [eventId]);
      const row = final.rows[0];
      row.assigned_member_ids = membersQ.rows.map(r => r.member_id);
      return row;
    }, userId);

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// Delete event
app.delete('/events/:id', async (req, res) => {
  const userId = req.currentUserId;
  const eventId = req.params.id;
  if (!userId) return res.status(401).json({ error: 'Missing demo user id' });

  try {
    const deleted = await withCurrentUser(async (client) => {
      const r = await client.query('DELETE FROM events WHERE id = $1 RETURNING id', [eventId]);
      return r.rowCount > 0;
    }, userId);

    if (!deleted) return res.status(404).json({ error: 'Not found or access denied' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// Export app for testing; only start server when run directly
module.exports = { app, pool, withCurrentUser };

if (require.main === module) {
  const port = process.env.PORT || 4000;
  app.listen(port, () => console.log(`Example server listening on port ${port}`));
}

