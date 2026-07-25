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
