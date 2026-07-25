# Family Calendar (PWA)

Scaffolded Vite + React project with Tailwind and PWA basics.

Next steps (run locally):

1. Ensure Node.js and npm are installed.
2. Install dependencies:

   npm install

3. Initialize Tailwind (if needed) and build/dev:

   npm run dev

4. Set environment variables for Supabase in a .env file at project root:

   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=public-anon-key

5. Open http://localhost:5173 to view the app.

Notes:
- npm wasn't available in the environment where these files were created, so dependencies were not installed here. Run `npm install` locally.
- The repository includes a PWA-ready vite.config.js using vite-plugin-pwa; icons (pwa-192x192.png, pwa-512x512.png) should be added to the project root or public folder.
