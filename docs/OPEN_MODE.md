# Open mode (no login, no payments)

When enabled, anyone who hits the app URL goes straight to the dashboard. No landing page gate, no login required, no Stripe charges. All backend routes and Supabase tables stay intact; unauthenticated requests use a single fallback user so flows (projects, Grok, export) work.

**cintiakimura.eu** is always treated as open mode on the frontend (root → dashboard, no login redirects, no pay walls). To have the backend use the fallback user and disable Stripe only for that domain, set `OPEN_MODE_ORIGIN` on the backend.

## Enable

1. **Backend (e.g. Render, Fly.io)**  
   - **`OPEN_MODE_FALLBACK_USER_ID`** = your Supabase user UUID (Supabase Dashboard → Authentication → Users → copy your UUID).  
   - Optional: **`OPEN_MODE_ORIGIN`** = `https://cintiakimura.eu` so only requests from that origin get the fallback user and Stripe disabled. If unset, all requests use the fallback when no token.

2. **Frontend (e.g. Vercel)**  
   Optional: **`VITE_OPEN_MODE=1`** for other domains to get open behavior. For **cintiakimura.eu** you don’t need it; the hostname is detected and open mode is applied automatically.

## Behavior

- **`/`** on cintiakimura.eu (or when VITE_OPEN_MODE) → redirects to **`/dashboard`**. **`/landing`** remains available.
- **`/pricing`** → redirects to **`/dashboard`** in open mode (Stripe disabled).
- **Login / Stripe** – Routes and UI stay; Stripe endpoints return 503 in open mode. No redirects to login; upgrade UI hidden (treated as Pro).
- **API** – Requests without a Bearer token get `userId = OPEN_MODE_FALLBACK_USER_ID` (and only when from OPEN_MODE_ORIGIN if that’s set).
- **Supabase / Vercel / GitHub** – Unchanged.

## Re-enable login and payments

- Remove **`OPEN_MODE_FALLBACK_USER_ID`** (and **`OPEN_MODE_ORIGIN`** if used) from the backend and redeploy.
- Remove **`VITE_OPEN_MODE`** from the frontend and redeploy. (cintiakimura.eu will still be open-mode by hostname unless you change the code.)
