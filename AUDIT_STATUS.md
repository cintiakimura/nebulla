# kyn — Functionality audit status

**Date:** 2026-03-09  
**Branch:** main

Status key: **OK** = implemented and working | **Partial** = works with config/env | **Config** = needs env or Supabase/Vercel setup | **N/A** = not applicable

---

## 1. Build & tooling

| Check | Status | Notes |
|-------|--------|------|
| **npm run lint** (tsc --noEmit) | OK | Passes |
| **npm run build** (vite build) | OK | dist/ produced; chunk size warning only |
| **npm audit** | OK | 0 vulnerabilities |
| **Test script** | Partial | `scripts/test-all.mjs` exists; run with `npm run dev` in another terminal, then `node scripts/test-all.mjs` |

---

## 2. Auth & login

| Functionality | Status | Notes |
|---------------|--------|-------|
| **Magic link (Supabase OTP)** | OK | Login form submits email → `signInWithOtp`; redirect `emailRedirectTo` = `/auth/callback`. Requires: Email provider enabled, Confirm email OFF, redirect URL whitelisted in Supabase |
| **Auth callback** | OK | `/auth/callback` handles return from magic link; `getSession` + `onAuthStateChange`; sets `kyn_user_id`, redirects to dashboard |
| **Fallback (no Supabase)** | OK | When `VITE_SUPABASE_*` not set: "Sign in (no backend)" calls `POST /api/auth/session`, gets/create userId |
| **Forgot password** | OK | Inline flow: email → `resetPasswordForEmail`; errors logged to console |
| **Session API** | OK | `POST /api/auth/session` returns/echoes `userId`; used when backend is same-origin or `VITE_API_URL` set |
| **Protected routes** | OK | `/settings`: redirect to `/login` if no `kyn_user_id`. `/setup`: same |

---

## 3. Frontend routes & pages

| Route | Status | Notes |
|-------|--------|------|
| **/** (Landing) | OK | Hero, pricing cards; "Login", "Sign up", "Sign up now", "Get all features" → `/login` |
| **/login** | OK | Email + magic link; forgot password; fallback when Supabase not configured |
| **/auth/callback** | OK | Magic link / OAuth return; completes sign-in |
| **/pricing** | OK | Pricing page |
| **/dashboard** | OK | Lists projects, create project, limits; first-login onboarding; requires backend for create |
| **/onboarding** | OK | Onboarding flow |
| **/builder**, **/builder/:projectId** | OK | Code editor, Grok chat, UI generation, deploy; paid status from Supabase/localStorage |
| **/setup** | OK | Setup wizard; **protected** (redirect to login if not logged in) |
| **/settings** | OK | Supabase URL/Anon Key, Vercel env vars (copy), Stripe Price ID, Connect GitHub/Google (OAuth); **protected** |

---

## 4. Backend API

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| **/api/auth/session** | POST | OK | Returns/creates userId |
| **/api/users/:userId/projects** | GET | OK | List projects (SQLite) |
| **/api/users/:userId/limits** | GET | OK | `{ projectLimit }` |
| **/api/users/:userId/projects** | POST | OK | Create project; 403 when free limit reached; paid from Supabase `users.paid` |
| **/api/users/:userId/projects/:projectId** | GET | OK | Get project (code, chat_messages, etc.) |
| **/api/users/:userId/projects/:projectId** | PUT | OK | Update project |
| **/api/agent/config** | GET | OK | agentId, systemPrompt, preCodeQuestions |
| **/api/agent/chat** | POST | Config | Grok chat; 503 if `GROK_API_KEY` not set |
| **/api/tts** | POST | Config | Grok TTS (Eve); 503 if `GROK_API_KEY` not set |
| **/api/builder/generate** | POST | Config | Builder.io; 503 if `BUILDER_PRIVATE_KEY` not set; free-tier daily limit |
| **/api/create-checkout-session** | POST | Config | Stripe Checkout; 503 if `STRIPE_SECRET_KEY` not set; needs price IDs |
| **/api/update-paid-status** | POST | Config | Upsert Supabase `users` paid/plan; 503 if Supabase not set |
| **/api/deploy** | POST | Partial | Mock only |
| **/api/stripe/checkout** | POST | Partial | Mock only |

---

## 5. Data & storage

| Item | Status | Notes |
|------|--------|------|
| **SQLite (projects)** | OK | `db.ts`; `kyn.db`; projects CRUD per user |
| **Supabase (auth)** | Config | Magic link + OAuth; requires `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (and redirect URLs) |
| **Supabase (users table)** | Config | `users.paid`, `users.plan` (and optional `admin`); backend uses `SUPABASE_URL` + `SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY` |
| **localStorage** | OK | `kyn_user_id`, `kyn_paid`, `kyn_plan`, Settings keys (`supabase_url`, `supabase_anon_key`, `stripe_price_id`) |

---

## 6. Integrations

| Integration | Status | Notes |
|-------------|--------|------|
| **Grok (xAI)** | Config | Chat + TTS; `GROK_API_KEY` in backend env |
| **Builder.io** | Config | UI generation; `BUILDER_PRIVATE_KEY`; optional free daily limit |
| **Stripe** | Config | Checkout + update-paid-status; `STRIPE_SECRET_KEY`, price IDs |
| **Supabase OAuth (GitHub/Google)** | Config | Settings "Connect GitHub" / "Connect Google" → `signInWithOAuth`; requires providers enabled and redirect URL in Supabase |

---

## 7. Deployment & env

| Item | Status | Notes |
|------|--------|------|
| **Vercel (frontend)** | OK | Static build; `vercel.json` SPA rewrite |
| **Backend (Node)** | Config | Must deploy `server.ts` (e.g. Railway/Render); set `ALLOWED_ORIGIN` for CORS |
| **VITE_API_URL** | Config | Set in Vercel (and backend URL in env) so frontend calls backend |
| **VITE_SUPABASE_*** | Config | Set in Vercel for magic link / email login |

---

## 8. Summary by area

| Area | Status |
|------|--------|
| **Lint / Build / Security** | OK |
| **Auth (magic link, callback, fallback, forgot password)** | OK (with Supabase config) |
| **Protected routes (Settings, Setup)** | OK |
| **Dashboard & Builder** | OK (backend + env required for full flow) |
| **Backend API** | OK (Grok/Builder/Stripe/Supabase require env) |
| **Stripe checkout & paid status** | Config (env + Supabase) |
| **Deploy (real)** | Partial (mock only; real deploy not wired) |

---

*Run `npm run lint`, `npm run build`, `npm audit`, and (with server running) `node scripts/test-all.mjs` to re-verify.*
