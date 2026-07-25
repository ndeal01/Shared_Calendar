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

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Example server listening on port ${port}`));
