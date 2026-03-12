# Deploy: Netlify (frontend) + Railway (backend)

Use this when your frontend is on Netlify and login/API don’t work because there’s no backend. The frontend will call your backend using `VITE_API_URL`.

---

## 1. Deploy the backend to Railway

1. Go to [railway.app](https://railway.app) and sign in (e.g. with GitHub).
2. **New project** → **Deploy from GitHub repo** → select your **kyn** repo.
3. Railway will detect the app. Configure:
   - **Build command:** `npm install`
   - **Start command:** `npx tsx server.ts` (TypeScript runs without a separate compile step).
   - **Root directory:** leave default (repo root).
4. **Variables:** Add the same env vars your backend needs (from your `.env`):
   - `GROK_API_KEY`
   - `STRIPE_SECRET_KEY`, `STRIPE_PRO_PRICE_ID`, `STRIPE_KING_PRO_PRICE_ID`
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY` (if you use paid status)
   - `ALLOWED_ORIGIN` = your Netlify site URL (e.g. `https://your-app.netlify.app`) so the server allows CORS from the frontend.
   - `PORT` is set by Railway automatically; you can leave it unset.
5. Deploy. Railway will assign a URL like `https://kyn-production-xxxx.up.railway.app`.
6. Copy that URL — you’ll use it as **VITE_API_URL** (no trailing slash).

---

## 2. Point Netlify at the backend

1. In **Netlify** → your site → **Site configuration** → **Environment variables** (or **Build** → **Environment**).
2. Add:
   - **Key:** `VITE_API_URL`
   - **Value:** your Railway URL, e.g. `https://kyn-production-xxxx.up.railway.app` (no trailing slash).
3. **Save** and trigger a **new deploy** (e.g. **Deploys** → **Trigger deploy** → **Clear cache and deploy site**).

The frontend is built with `VITE_API_URL` baked in, so all API calls (login, projects, chat, Stripe, etc.) go to Railway.

---

## 3. CORS

The backend already supports CORS when `ALLOWED_ORIGIN` is set. In step 1 you added `ALLOWED_ORIGIN` = your Netlify URL. If you didn’t, add it in Railway → Variables → `ALLOWED_ORIGIN` = `https://your-app.netlify.app`, then redeploy.

---

## 4. Check

- Open your **Netlify URL** → Login → you should land on the dashboard and requests should go to the Railway URL (check Network tab: `https://xxx.railway.app/api/...`).
- If login still fails, check Railway logs and Netlify build logs; confirm `VITE_API_URL` is set and that the new deploy completed after adding it.

---

## Alternative: one host (no Netlify)

You can run both frontend and backend on **Railway** (or Render):

- **Build:** `npm run build && npm install` (so `dist` exists).
- **Start:** `npx tsx server.ts` (or `node server.ts` if you compile).
- **Variables:** same as above; no `VITE_API_URL` needed (API is same origin).

Then use the Railway app URL for everything; no Netlify required.
