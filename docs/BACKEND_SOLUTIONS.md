# Backend not working — solutions

If the app shows "Backend not configured" or API calls fail (404, CORS, connection), use one of these approaches.

**If you see errors mentioning `railway.app`:** The app no longer uses Railway. Those URLs are ignored. Add your new backend URL (e.g. Render, Fly.io) in Settings → Backend URL or set `VITE_API_URL` and redeploy (see below).

---

## ⚠️ Common mistake: wrong URL

**`VITE_API_URL` must be your BACKEND server URL** (where `server.ts` runs and serves `/api/health`, `/api/config`, etc.), **not your frontend/site URL**.

- **Wrong:** `VITE_API_URL=https://www.cintiakimura.eu` — if that host only serves the React app (e.g. Vercel), it does **not** serve `/api/*`. Requests to `https://www.cintiakimura.eu/api/...` will 404 or fail.
- **Right:** `VITE_API_URL=https://api.cintiakimura.eu` or `https://your-app.onrender.com` — the host where you **deployed server.ts** (Node/Express). That server must be running and must have `ALLOWED_ORIGIN=https://www.cintiakimura.eu` (your frontend) for CORS.

So: **frontend** = where users open the app (e.g. www.cintiakimura.eu). **Backend** = where the API runs (different URL or subdomain). Set `VITE_API_URL` to the **backend** URL only.

---

## Solution 1: Set backend URL at build time (recommended for production)

When the frontend is on **Vercel** or **Netlify**, the backend URL must be set when the frontend is built.

1. Deploy your backend (e.g. **Render**, **Fly.io**) so `server.ts` runs and `/api/health` returns 200.
2. In your **frontend** host (Vercel/Netlify):
   - **Environment variables** → add **`VITE_API_URL`** = your backend URL, e.g. `https://your-app.onrender.com` (no trailing slash).
   - Set it for **Production** (and Preview if you use preview deploys).
3. **Redeploy** the frontend so the new build includes the variable. Changing the variable alone is not enough — you must trigger a new deploy.

**Check:** In the browser, open DevTools → Network. API requests should go to your backend URL, not to `your-vercel-app.vercel.app/api/...`.

---

## Solution 2: Paste URL in Settings (quick test, same device)

For a quick test without redeploying:

1. Open the app (e.g. https://www.cintiakimura.eu) → **Settings**.
2. In **Backend URL**, paste the URL where your **backend** runs (e.g. `https://your-app.onrender.com` or `https://api.cintiakimura.eu`). Not your frontend URL.
3. Click **Save**.

The URL is stored in **localStorage** for this browser. For a permanent fix, set `VITE_API_URL` in your frontend host (Vercel etc.) and redeploy.

---

## Solution 3: Run frontend and backend on the same origin (no separate backend URL)

If you run the app with **`npm run dev`**, the frontend and backend are on the same origin (e.g. `http://localhost:3000`). No `VITE_API_URL` or wizard URL is needed — the app uses relative `/api/...` and it works.

You can also deploy **both** frontend and backend on **one host** (e.g. Render or Fly.io): build the frontend, serve `dist/` and `server.ts` from the same app so `/api/*` is handled by the server. Then open that single URL in the browser; no CORS and no backend URL config needed.

---

## Solution 4: CORS (backend reachable but browser blocks requests)

If the backend is running and `VITE_API_URL` is correct but you still see **CORS** errors in the console:

- On the **backend** server, set **`ALLOWED_ORIGIN`** to your frontend origin, e.g. `https://your-app.vercel.app` (no trailing slash).
- Restart the backend after changing env vars.

---

## Summary

| Situation | What to do |
|-----------|------------|
| Frontend on Vercel/Netlify | Set `VITE_API_URL` in the frontend project’s env and **redeploy**. |
| Quick test in one browser | Settings → Backend URL → paste backend URL → Save. |
| Local dev | Run `npm run dev`; no backend URL needed. |
| CORS errors | Set `ALLOWED_ORIGIN` on the backend to the frontend origin. |

See also **TROUBLESHOOTING_DEPLOY.md** for full deploy and auth checks.
