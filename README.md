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
   - `NETLIFY_PAT`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`

## Deploying frontend (Vercel / Netlify) and backend

The repo builds a **static frontend** (Vite). Vercel and Netlify deploy only that—there is **no API** on the static host, so `/api/auth/session` and `/api/users/.../projects` would 404.

- **Frontend only (no backend):** Do **not** set `VITE_API_URL`. The app runs in **demo mode**: after the first failed request it stops calling the API, so no 404s. Login and “Start with Grok” work with a local session and open the Builder in demo mode. Use **`vercel.json`** (Vercel) or **`public/_redirects`** (Netlify) so routes like `/login` and `/dashboard` serve the app (SPA).
- **With a backend:** Deploy the Express server (e.g. **Railway**, **Render**, **Fly.io**) and point the frontend to it:
  1. On the backend, set `ALLOWED_ORIGIN` to your frontend URL (e.g. `https://your-app.vercel.app`) for CORS.
  2. In Vercel/Netlify → Environment variables, add **`VITE_API_URL`** = your backend URL (e.g. `https://your-backend.railway.app`, no trailing slash).
  3. Redeploy so the build picks up `VITE_API_URL`. Login and projects will then use the real API.

## Grok API not working (405 or "Request failed")?

Chat with Grok only works when the **backend** is running and has a valid **xAI** key:

1. **Run the backend** (e.g. `npm run dev` locally, or deploy `server.ts` to Railway/Render/Fly.io).
2. On the machine running the backend, set **`GROK_API_KEY`** in `.env` (get a key at [console.x.ai](https://console.x.ai)).
3. If the frontend is on a different host (e.g. Vercel), set **`VITE_API_URL`** to that backend URL and redeploy the frontend.

If you only deploy the static frontend (e.g. cintiakimura.eu), there is no server to handle `POST /api/agent/chat`, so you get 405. Deploy the Express server and point the app at it (step 2 above).

## Features

- **Mind Map Wizard**: Drag and drop pages, roles, and nodes to architect your app.
- **AI Code Generation**: AI handles code and self-debugs via REST method (Review, Explain, Solve, Test).
- **One-Click Deploy**: Deploy directly to Firebase or Netlify from within the app.
