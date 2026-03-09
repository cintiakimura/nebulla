# Connect Vercel frontend to backend

Your app on Vercel has **no backend** until you do these two things.

## 1. Deploy the backend (Node/Express)

The API lives in `server.ts`. Deploy it to a host that runs Node:

| Host    | Steps |
|--------|--------|
| **Railway** | New project → Deploy from GitHub (this repo) → Set root directory to repo root → Add env vars (see below) → Deploy. Copy the public URL (e.g. `https://kyn-production.up.railway.app`). |
| **Render**  | New Web Service → Connect repo → Build: `npm install` / Start: `npm start` (or `npx tsx server.ts`). Add env vars. Copy the service URL. |
| **Fly.io**  | `fly launch` in repo, then `fly secrets set KEY=value` for env. Copy `https://your-app.fly.dev`. |

**Backend env vars** (same as `.env`, plus CORS):

- `SUPABASE_URL`, `SUPABASE_ANON_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) — for users/paid checks
- `GROK_API_KEY` — for chat and TTS (Eve)
- **`ALLOWED_ORIGIN`** = your Vercel app URL, e.g. `https://kyn-jbzpg19gy-cintia-kimuras-projects.vercel.app` or your custom domain. No trailing slash. Required so the browser can call your API (CORS).

Optional: `STRIPE_SECRET_KEY`, `BUILDER_PRIVATE_KEY`, `FREE_PROJECT_LIMIT`, etc.

## 2. Point Vercel at the backend

In **Vercel** → your project → **Settings** → **Environment Variables**, add:

| Name | Value | Environment |
|------|--------|-------------|
| **VITE_API_URL** | Your backend URL, e.g. `https://kyn-production.up.railway.app` | Production (and Preview) |
| **VITE_SUPABASE_URL** | Your Supabase project URL | Production (and Preview) |
| **VITE_SUPABASE_ANON_KEY** | Supabase anon (publishable) key | Production (and Preview) |

No trailing slash on `VITE_API_URL`. Then **redeploy** so the build picks up these variables.

## Quick check

- **Backend:** `curl -X POST https://YOUR_BACKEND_URL/api/auth/session -H "Content-Type: application/json"` → should return `{"userId":"..."}`.
- **Frontend:** After redeploy, open your Vercel URL → Login. You should see email/password form and no “Sign in (no backend)”.
