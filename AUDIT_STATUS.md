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
| **/api/stitch/generate** | POST | Config | Google Stitch; 503 if `STITCH_API_KEY` / `GOOGLE_STITCH_API_KEY` not set; free-tier daily limit |
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
| **Google Stitch** | Config | UI generation; `STITCH_API_KEY` (or `GOOGLE_STITCH_API_KEY`); optional `STITCH_PROJECT_ID`; optional free daily limit |
| **Stripe** | Config | Checkout + update-paid-status; `STRIPE_SECRET_KEY`, price IDs |
| **Supabase OAuth (GitHub/Google)** | Config | Settings "Connect GitHub" / "Connect Google" → `signInWithOAuth`; requires providers enabled and redirect URL in Supabase |

---

## 7. Deployment & env

| Item | Status | Notes |
|------|--------|------|
| **Vercel (frontend)** | OK | Static build; `vercel.json` SPA rewrite |
| **Backend (Node)** | Config | Must deploy `server.ts` (e.g. Render, Fly.io); set `ALLOWED_ORIGIN` for CORS |
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

## 9. VETR Final debugging test

The **Final debugging test** (Dashboard → status bar / audit modal) runs a **full multi-turn VETR loop** (Verify → Explain → Trace → Repair → Validate), not a one-shot report. **UNBREAKABLE_RULES.md** is loaded from `/UNBREAKABLE_RULES.md` (public) and injected verbatim as the very first part of the system prompt for every VETR call.

| Behavior | Status |
|----------|--------|
| **UNBREAKABLE RULES** | Fetched on button click; prepended with "These are UNBREAKABLE RULES. You MUST follow every single one without exception. Violating any rule = immediate 0/100 confidence and forced fresh start." |
| **Phase 0** | Runs `runQuickAudit(apiBase)` once; builds report text with PASS/FAIL per endpoint. |
| **Iterations** | Up to 7 rounds: feedback = audit report + extracted new failures each turn; each round sends full conversation (user + assistant history) to Grok; progress shows "Running VETR Iteration X/7 — Phase Y". |
| **Structured output** | Prompt enforces exact headings: Phase 0–7, A. Bug Hypothesis List, B. Most Likely Root Cause, C. Wrong Code Explanation, D. Variable/State Trace, E. Proposed Fix Strategy. "If any section is missing, self-rate 0/100 and restart the entire loop." |
| **Termination** | Stops when: (a) model outputs Phase 7 — Termination with all tests pass and confidence ≥92, or (b) max 7 iterations reached. |
| **Decay / Fresh Start** | If after 4+ iterations there is no progress (e.g. "still fail", "stalled"), next user message triggers Strategic Fresh Start (summary + reset context + rephrase problem + new generation). Modal shows "Resetting context and restarting generation." |
| **UI** | Modal shows live progress (e.g. "Running VETR Iteration 3/7 — Phase 2: Self-Reflection") and collapsible sections from parsed VETR output (phases, hypotheses, diff, etc.). |

### Example: full multi-turn VETR run (forced bug)

To test, force a bug (e.g. comment out a key line in `server.ts` for `/api/agent/chat` or `/api/stitch/generate`), then click **Final debugging test**. Expected: 3–5+ iterations with full phases each time.

**Example modal progress (abbreviated):**

```
Iteration 1/7: Calling Grok…
Iteration 2/7: Continuing VETR…
Iteration 3/7: Continuing VETR…
Iteration 4/7: Continuing VETR…
Done. Confidence: 94%
```

**Example VETR output sections (from one iteration):**

- **Phase 2: Structured Self-Reflection**
  - **A. Bug Hypothesis List** — 1. Missing API key check … 2. Handler returns before calling Grok …
  - **B. Most Likely Root Cause** — The handler does not read `X-Grok-Api-Key` when env key is unset.
  - **C. Wrong Code Explanation** — Line 584: `const apiKey = process.env.GROK_API_KEY` …
  - **D. Variable/State Trace** — req.headers not read → apiKey undefined → 503.
  - **E. Proposed Fix Strategy** — Prefer header then env; return 503 with message "Add your Grok API key in Settings."
- **Phase 3: Minimal repair** — (diff with file/line references)
- **Phase 5: Simulate execution** — Request with header → apiKey set → 200.
- **Phase 7 — Termination** — All tests pass. Confidence: 94%.

The implementation enforces multiple rounds, self-reflection, minimal diff repair, and validation until confidence ≥92 or max iterations.

---

*Run `npm run lint`, `npm run build`, `npm audit`, and (with server running) `node scripts/test-all.mjs` to re-verify.*
