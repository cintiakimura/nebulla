# Using Vercel as Your Server (Frontend + API)

When you deploy this repo to **one Vercel project**, both the **frontend** (React SPA) and the **backend** (Express API) run on Vercel. You don’t need a separate server or `VITE_API_URL` for the same deployment.

## How It Works

- **Frontend**: Built with `vite build` and served from the root (e.g. `cintiakimura.eu/`, `/dashboard`, `/builder/…`).
- **Backend**: All `/api/*` requests are handled by the serverless function in `api/[[...path]].ts`, which runs the same Express app as `server.ts`.

So **Vercel is your server**: the API lives at the same host as the app (e.g. `https://cintiakimura.eu/api/health`, `https://cintiakimura.eu/api/users/.../projects`).

## Environment Variables (Vercel Dashboard)

In **Vercel → Project → Settings → Environment Variables**, set at least:

| Variable | Purpose |
|----------|---------|
| `GROK_API_KEY` | xAI key for chat and TTS (get at console.x.ai). |
| `SUPABASE_URL` | Supabase project URL (for project storage and optional auth). |
| `SUPABASE_ANON_KEY` | Supabase anon key. |
| `OPEN_MODE_FALLBACK_USER_ID` | (Optional) A fixed user id when using open mode (no login). |
| `OPEN_MODE_ORIGIN` | (Optional) e.g. `https://cintiakimura.eu` so only that origin gets open-mode fallback. |
| `ALLOWED_ORIGIN` | (Optional) If you use a different frontend URL, set it for CORS. |

For **project persistence** (projects and limits), use **Supabase**. On serverless, SQLite is not persistent (and would use `/tmp` if used at all), so Supabase is the right choice.

## Same-Origin: No Backend URL Needed

When frontend and API are on the same Vercel project and domain:

- Leave **VITE_API_URL** unset (and don’t set a Backend URL in Settings).
- The app will call `/api/...` on the same origin, and Vercel will route those requests to the serverless backend.

## Build and Deploy

1. Connect the repo to Vercel and deploy as usual.
2. Set the env vars above in the Vercel project.
3. Build command: `npm run build` (builds the frontend).
4. Output: use the default (e.g. `dist` for Vite), and keep the `api/` folder so Vercel deploys the serverless function.

After deploy, the same domain serves both the app and the API; no extra server is required.
