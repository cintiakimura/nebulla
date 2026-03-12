# Deploy: Netlify (frontend) + Backend (Render, Fly.io)

Use this when your frontend is on Netlify and login/API don't work because there's no backend. The frontend will call your backend using `VITE_API_URL`.

---

## 1. Deploy the backend (Render or Fly.io)

1. Sign in to [Render](https://render.com) or [Fly.io](https://fly.io) (e.g. with GitHub).
2. **New** → **Web Service** (Render) or **Launch app** (Fly.io) → deploy from your **kyn** repo.
3. Configure:
   - **Build command:** `npm install`
   - **Start command:** `npx tsx server.ts` (TypeScript runs without a separate compile step).
   - **Root directory:** leave default (repo root).
4. **Environment variables:** Add the same env vars your backend needs (from your `.env`):
   - `GROK_API_KEY`
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY` (if you use auth/paid status)
   - `ALLOWED_ORIGIN` = your Netlify site URL (e.g. `https://your-app.netlify.app`) so the server allows CORS from the frontend.
   - `PORT` is set by the host automatically on Render; set if needed on Fly.io.
5. Deploy. The host will assign a URL (e.g. `https://your-app.onrender.com` or `https://your-app.fly.dev`).
6. Copy that URL — you'll use it as **VITE_API_URL** (no trailing slash).

---

## 2. Point Netlify at the backend

1. In **Netlify** → your site → **Site configuration** → **Environment variables** (or **Build** → **Environment**).
2. Add:
   - **Key:** `VITE_API_URL`
   - **Value:** your backend URL, e.g. `https://your-app.onrender.com` (no trailing slash).
3. **Save** and trigger a **new deploy** (e.g. **Deploys** → **Trigger deploy** → **Clear cache and deploy site**).

The frontend is built with `VITE_API_URL` baked in, so all API calls (login, projects, chat, etc.) go to your backend.

---

## 3. CORS

The backend supports CORS when `ALLOWED_ORIGIN` is set. In step 1 you added `ALLOWED_ORIGIN` = your Netlify URL. If you didn't, add it in your backend host's variables: `ALLOWED_ORIGIN` = `https://your-app.netlify.app`, then redeploy.

---

## 4. Check

- Open your **Netlify URL** → Login → you should land on the dashboard and requests should go to your backend URL (check Network tab: `https://.../api/...`).
- If login still fails, check backend logs and Netlify build logs; confirm `VITE_API_URL` is set and that the new deploy completed after adding it.

---

## Alternative: one host (no Netlify)

You can run both frontend and backend on **Render** or **Fly.io**:

- **Build:** `npm run build && npm install` (so `dist` exists).
- **Start:** `npx tsx server.ts` (or `node server.ts` if you compile).
- **Variables:** same as above; no `VITE_API_URL` needed (API is same origin).

Then use the app URL for everything; no Netlify required.
