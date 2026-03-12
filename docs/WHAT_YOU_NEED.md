# What you need to provide for kyn

## 1. Grok (chat)

- **One API key** from [console.x.ai](https://console.x.ai) — the same key is used for **chat** in the app.
- In `.env`: `GROK_API_KEY=your_key`

There is no separate "normal" vs "chat" key in this app; we only use the chat completions API.

---

## 2. Stripe

- **Secret key** (sk_...) → `STRIPE_SECRET_KEY`
- **Publishable key** (pk_...) → `STRIPE_PUBLIC_KEY`
- **Price ID** for Pro €19.90/mo → `STRIPE_PRO_PRICE_ID` or `STRIPE_KING_PRO_PRICE_ID`

All go in `.env`. The app reads them; no extra step to "add publishable" elsewhere.

---

## 3. Supabase

- **Project URL** → `SUPABASE_URL`
- **Anon key** → `SUPABASE_ANON_KEY`

Used so the app can save **paid status** after Stripe checkout (e.g. upsert into a `users` table).  
Supabase is **not** where we deploy the app — it’s a backend the app calls.

---

## 4. Deploying the app (where the app runs)

The app (frontend + Node server) is deployed on a **hosting platform**, not on Supabase.

| If you deploy with… | You need from them |
|---------------------|--------------------|
| **Vercel**          | Account; connect GitHub repo (no API key for basic deploy). |
| **Netlify**         | Account; connect repo or Netlify API token. |
| **Render / Fly.io** | Account; often API token or GitHub. |
| **Your own server** | Server + Node; no deploy API. |

You do **not** need a special "deploy API" for Supabase. You only need whatever the **hosting platform** (Vercel, Netlify, etc.) requires (e.g. GitHub connection or their token).

**Do you need any API for deployment?** No. Grok, Stripe, and Supabase are used by the app at runtime; they are not deployment APIs. For deployment you only need an account (and optionally a token) on the host you choose (e.g. Vercel or Netlify).

---

## 5. Netlify and Vercel (deploy hosts + in-app deploy buttons)

**Current state:** The “Push to GitHub” and “Auto-Deploy” (Netlify) buttons in the Builder are **mocks** — they don’t call Netlify or Vercel APIs yet. So you don’t need to add any Netlify or Vercel keys for the app to run or for those buttons to “succeed” (they just log and return success).

**Deploying the kyn app itself (this repo) to Netlify or Vercel:**

| Host     | What you need | Where to get it |
|----------|----------------|------------------|
| **Netlify** | Nothing in `.env`. Connect your **GitHub repo** in Netlify’s dashboard; Netlify builds and deploys. Optionally: **Team** = the team/site you’re deploying to (you see a Team ID or team slug in the URL, e.g. `app.netlify.com/teams/your-team`). | [Netlify](https://app.netlify.com) → Add new site → Import from Git. |
| **Vercel**  | Nothing in `.env`. Connect your **GitHub repo** in Vercel’s dashboard. | [Vercel](https://vercel.com) → New Project → Import repo. |

So: **no API key or user ID required** to deploy. You only need your Netlify or Vercel account and “Import from Git”.

**If we later wire real “Auto-Deploy” (Netlify API) from inside the app:**

- **Netlify:** We’d use a **Personal Access Token (PAT)**, not a “user ID”. Optional: **Team ID** (or team slug) if you deploy into a team. You’d add to `.env`: `NETLIFY_AUTH_TOKEN=...` (PAT from Netlify → User settings → Applications → Personal access tokens) and optionally `NETLIFY_TEAM_ID=...` or team slug. The `.env.example` name `NETLIFY_CLIENT_ID` is for a possible OAuth app; for server-side deploy the right thing is the PAT.
- **Vercel:** We’d use a **Vercel token** from the dashboard (Account → Settings → Tokens). You’d add `VERCEL_TOKEN=...`.

**Summary:** You don’t need anything from Netlify or Vercel in `.env` right now. For deploying kyn: connect the repo in their UI. The Team ID you found is useful only if we add real Netlify API deploy; then we’d need a PAT (and optionally that team ID), not a “user ID”.

**Login or voice not working on Vercel/static URL:** The static host has no Node server, so `/api/*` returns 404. Fix: (1) Deploy the backend (`server.ts`) somewhere that runs Node (e.g. Render, Fly.io). (2) Set **`VITE_API_URL`** in your static host’s build env to that backend URL (e.g. `https://your-app.onrender.com`, no trailing slash). Rebuild and redeploy. Then login and voice use the backend.

---

## 6. Voice (Grok Eve)


No extra API is required for this. We use the same Grok chat API; voice in/out is handled by the browser (STT + TTS). If later you want Grok’s own voice (e.g. an xAI Voice or realtime API), that would be an optional add-on and would need whatever xAI provides.

---

## Quick checklist

- [ ] `.env` has `GROK_API_KEY` (xAI chat key).
- [ ] `.env` has `STRIPE_SECRET_KEY`, `STRIPE_PUBLIC_KEY`, and the two Price IDs.
- [ ] `.env` has `SUPABASE_URL` and `SUPABASE_ANON_KEY` (for paid status).
- [ ] Supabase has a `users` table (id, paid, plan) if you use checkout.
- [ ] For deploy: pick a host (Vercel or Netlify), connect GitHub repo in their UI; no Netlify/Vercel keys in `.env` required.
