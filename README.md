# kyn - Developer-First SaaS Starter

One-time setup after login—no repeats. Platform owner fills env once.

## Known npm warnings (safe to ignore)

When you run `npm install` or `npm run build`, you may see deprecation warnings from **transitive** dependencies (not from this repo directly):

- **prebuild-install** – used by `better-sqlite3` for native bindings; still works. Upstream may switch to `prebuildify` later.
- **intersection-observer** – polyfill pulled in by Sandpack; modern browsers don’t need it. The warning is from a dependency.
- **boolean** – optional dependency of another package; no action needed.

These do not affect build or runtime. The Vite **chunk size** warning is relaxed in `vite.config.ts` (`chunkSizeWarningLimit: 1000`).

**Browser console:** `A listener indicated an asynchronous response by returning true...` is from a **browser extension** (e.g. password manager, ad blocker), not from this app. You can ignore it or disable extensions on the site.

## Setup Instructions

1. Copy `.env.example` to `.env`
2. Fill in the required placeholders:
   - `FIREBASE_PROJECT_ID`
   - `GITHUB_CLIENT_ID`
   - `GITHUB_CLIENT_SECRET`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`

## Deploying frontend (Vercel) and backend

The repo builds a **static frontend** (Vite). You must run the **backend** (Express in `server.ts`) for login and projects to work. There is no API on a static host alone.

- **With a backend:** Deploy the Express server (e.g. **Railway**, **Render**, **Fly.io**) and point the frontend to it:
  1. On the backend, set `ALLOWED_ORIGIN` to your frontend URL (e.g. `https://your-app.vercel.app`) for CORS.
  2. In Vercel (or your static host) → Environment variables, add **`VITE_API_URL`** = your backend URL (e.g. `https://your-backend.railway.app`, no trailing slash).
  3. Redeploy so the build picks up `VITE_API_URL`. Login and projects will then use the real API.

Use **`vercel.json`** (Vercel) or your host's SPA redirect so routes like `/login` and `/dashboard` serve the app.

## Grok API not working (405 or "Request failed")?

Chat with Grok only works when the **backend** is running and has a valid **xAI** key:

1. **Run the full app** with **`npm run dev`** (this starts the Express server + Vite; do **not** run only `vite` or `npm run preview` or you’ll get 404/405 on `/api/agent/chat`).
2. In the project root, put **`GROK_API_KEY`** in **`.env`** (get a key at [console.x.ai](https://console.x.ai)). Restart `npm run dev` after changing `.env`.
3. Chat uses **Grok 4.1 reasoning** by default (`grok-4-1-fast-reasoning`). Override with `GROK_MODEL` if needed.
4. If the frontend is on a different host (e.g. Vercel), set **`VITE_API_URL`** to that backend URL and redeploy the frontend.

If you only deploy the static frontend, there is no server to handle `POST /api/agent/chat`, so you get 405. Deploy the Express server and point the app at it (step 2 above).

## Freemium & UI generation

- **Free project limit:** Set `FREE_PROJECT_LIMIT=3` (default) in `.env`. Backend returns 403 `free_project_limit_reached` when a free user tries to create a 4th project. Paid status is read from Supabase `users.paid`.
- **UI code generation:** `POST /api/builder/generate` proxies to Builder.io Visual Copilot (`https://api.builder.io/v1/ai/generate`). Uses `BUILDER_PRIVATE_KEY` (Builder.io dashboard → API keys). Free tier: `BUILDER_GENERATION_FREE_DAILY_LIMIT=10` per user per day; Pro unlimited. Generated React + Tailwind code is applied in the Builder; Grok 4.1 can refine or add logic on follow-up.

## Features

- **Mind Map Wizard**: Drag and drop pages, roles, and nodes to architect your app.
- **AI Code Generation**: AI handles code and self-debugs via REST method (Review, Explain, Solve, Test).
- **One-Click Deploy**: Deploy directly to Firebase from within the app.
