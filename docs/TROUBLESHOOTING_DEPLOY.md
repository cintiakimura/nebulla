# Why login, magic link, GitHub, and Grok don’t work after deploy

If you committed and pushed but the **live site** (e.g. Vercel) still shows the old version and nothing works, it’s almost always one of these.

---

## 0. VITE_API_URL must apply to Production (Vercel)

**`VITE_API_URL`** is baked into the frontend at **build time**. If it’s set only for “Preview” or “Pre-Production”, your **Production** build will not have it.

- In Vercel → Project → **Settings** → **Environment Variables**:
  - Edit **`VITE_API_URL`** and set **Environment** to **Production** (or “All Environments”).  
  - Value = your backend URL, e.g. `https://your-app.onrender.com` (no trailing slash).
- Save, then **redeploy** Production so the new build includes the variable.

---

## 1. Frontend doesn’t know where the backend is

The app runs in the **browser**. Login, magic link, GitHub, and Grok all call **your backend**. The frontend needs the backend URL **at build time**.

- **On Vercel:** Set **Environment Variables** for the project:
  - **`VITE_API_URL`** = your backend URL, e.g. `https://your-app.onrender.com`  
    No trailing slash. This is the same URL you use for the API (Render, Fly.io, etc.).
- Then **redeploy**: Deployments → … → Redeploy (or push a small commit).  
  If you only added `VITE_API_URL` after the last deploy, the current build **does not** include it until you redeploy.

**Check:** Open the live site → DevTools → Console. In the app, trigger something that calls the API (e.g. open Login or Dashboard). In Network tab, see whether requests go to your backend URL or to `https://your-vercel-domain.vercel.app/api/...`. If they go to Vercel’s `/api/...`, the frontend has no backend URL (VITE_API_URL not set or not in the build).

---

## 2. Backend not running or not reachable

- **Render / Fly.io:** Confirm the service is **running** and the URL is the one you put in `VITE_API_URL`. Open `https://your-backend-url/api/health` in a browser; you should get a short JSON response, not 404 or connection error.
- **CORS:** On the backend, set **`ALLOWED_ORIGIN`** to your frontend origin, e.g. `https://your-app.vercel.app`. No trailing slash. If this is wrong, the browser will block API requests and you’ll see CORS errors in the console.

---

## 3. Supabase (magic link, Google, GitHub)

Login (email/magic link) and “Sign in with Google/GitHub” use **Supabase Auth**.

**Which key goes where:**

- **Vercel (frontend):** Use the **Publishable** key for `VITE_SUPABASE_ANON_KEY`.  
  In Supabase → Project Settings → API → **Publishable key** (the one that says “safe to use in a browser”).  
  Do **not** put a **Secret** key in `VITE_SUPABASE_ANON_KEY` — that’s for server-only and would break auth.
- **Backend:** Use **`SUPABASE_URL`** and **`SUPABASE_ANON_KEY`** (same anon/publishable key is fine for validating tokens). Use **`SUPABASE_SERVICE_ROLE_KEY`** only on the backend, never on Vercel.

**Supabase Dashboard** → Authentication → URL Configuration:

- **Site URL:** your frontend URL, e.g. `https://your-app.vercel.app`
- **Redirect URLs:** add:
  - `https://your-app.vercel.app/**`
  - `https://your-app.vercel.app/auth/callback`

**Google / GitHub:** Authentication → Providers → enable Google and GitHub, set Client ID and Secret. In Google Cloud Console / GitHub OAuth App, set the redirect URL to the one Supabase shows (e.g. `https://your-project.supabase.co/auth/v1/callback`).

---

## 4. Grok

Grok chat calls the backend at **`/api/agent/chat`**. So:

- Backend must be reachable (see §1 and §2).
- Backend env must have **`XAI_API_KEY`** or **`GROK_API_KEY`** set (from [console.x.ai](https://console.x.ai)).

**Slow replies:** Each message is one **non-streaming** round-trip to xAI (`stream: false`), then optional TTS (`/api/tts`). Latency is mostly **model + network + cold Vercel/serverless**. To tune: set **`GROK_MODEL`** on the backend to a faster model if your account supports it; keep **`VITE_API_URL`** pointing at a **warm** backend if you use a separate host; expect **several seconds** for long answers.

---

## 5. “Old version” still showing

- **Redeploy:** After changing env vars (especially `VITE_API_URL`), trigger a **new deploy** so the new build is used.
- **Cache:** Do a hard refresh (e.g. Ctrl+Shift+R or Cmd+Shift+R) or open the site in an incognito window. If you use a CDN, purge cache if needed.

---

## Quick checklist

| Where        | What to check |
|-------------|----------------|
| **Vercel**  | `VITE_API_URL` = backend URL (no trailing slash). Redeploy after changing. |
| **Backend** | Running; `/api/health` works. `ALLOWED_ORIGIN` = frontend origin. `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GROK_API_KEY` set. |
| **Supabase**| Site URL and Redirect URLs include your frontend URL and `/auth/callback`. GitHub provider enabled if you use GitHub login. |
| **Browser** | Hard refresh or incognito; Network tab shows requests going to the backend URL, not to Vercel’s `/api/...`. |

If all of the above are correct, login, magic link, GitHub, and Grok should work. If something still fails, check the browser Console and Network tab for the exact error (e.g. 404, CORS, 401, 503) and which URL was called.
