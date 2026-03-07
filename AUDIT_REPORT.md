# kyn — Audit test report

**Date:** 2026-03-06  
**Branch:** main  

---

## 1. Port & dev server

| Item | Value |
|------|--------|
| **Dev server port** | `process.env.PORT` or **3000** (default) |
| **URL (local)** | `http://localhost:3000` |
| **Start command** | `npm run dev` (runs Express + Vite; API and frontend on same origin) |
| **Preview (static)** | `npm run preview` → `http://localhost:4173` (Vite default) |

---

## 2. Login / Sign up (previously broken — current status)

**What was broken:** On static deploys (Vercel/Netlify), the app called `/api/auth/session` and `/api/users/.../projects`. Those routes don’t exist on the static host → 404. Login/sign up appeared to “go straight to dashboard” and “Start with Grok” did nothing.

**Current behavior:**

| Context | Behavior |
|--------|----------|
| **No backend** (Vercel/Netlify, no `VITE_API_URL` or same-origin) | `isBackendAvailable()` is false. No API calls. Login/Sign up → local userId → dashboard. “Start with Grok” → Builder in demo mode. No 404s. |
| **Backend available** (`npm run dev` or `VITE_API_URL` set to a real API) | Session and projects use API. “Start with Grok” creates project and opens Builder. |
| **First load with wrong `VITE_API_URL`** (e.g. pointing at Vercel) | First request 404s → `setBackendUnavailable()` → subsequent requests skipped; demo mode for rest of session. |

**Relevant code:** `src/lib/api.ts` (`isBackendConfigured`, `isBackendAvailable`, `setBackendUnavailable`), `src/lib/auth.ts` (`getUserId`), `src/pages/Login.tsx`, `src/pages/Dashboard.tsx` (`createAndOpenProject`).

---

## 3. Stripe for payments

| Item | Status |
|------|--------|
| **Env vars** | `STRIPE_SECRET_KEY`, `STRIPE_PUBLIC_KEY`, `STRIPE_PROTOTYPE_PRICE_ID`, `STRIPE_KING_PRO_PRICE_ID` (no hardcoding). |
| **Create session** | `POST /api/create-checkout-session` body `{ plan: 'prototype' \| 'king_pro' }` → returns `{ id, url }`. Implemented in `src/api/create-checkout-session.ts`. |
| **Success redirect** | `success_url` → `/builder?paid=true&plan={plan}`. Builder reads query → `POST /api/update-paid-status` with `{ plan, userId }` → `setPaidFromSuccess(plan)` → clear query. |
| **Cancel** | `cancel_url` → `/builder`. |
| **Prototype** | 30-day trial; coupon `30KYN` (if configured in Stripe). |
| **King Pro** | Standard subscription. |
| **Deploy gate** | Builder shows “Upgrade to Deploy” when `!paid`; deploy buttons gated by paid. |
| **Supabase** | `update-paid-status` upserts `users` (id, paid, plan). Requires `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `users` table. |

---

## 4. Git status

| Item | Result |
|------|--------|
| Branch | main |
| Uncommitted changes | (run `git status` for current state) |

---

## 5. npm audit (security)

| Severity | Count |
|----------|--------|
| Critical | 0 |
| High | 0 |
| Moderate | **3** |
| Low | 0 |

### 5.1 Vulnerabilities

| Package | Affected | Issue |
|---------|----------|--------|
| **dompurify** | 3.1.3 – 3.3.1 | Cross-site Scripting (XSS) — [GHSA-v2wj-7wpq-c8vv](https://github.com/advisories/GHSA-v2wj-7wpq-c8vv) |
| **monaco-editor** | ≥0.54.0-dev-20250909 | Depends on vulnerable dompurify |
| **electron** | &lt;35.7.5 | ASAR Integrity Bypass — [GHSA-vmqv-hx8q-j7mg](https://github.com/advisories/GHSA-vmqv-hx8q-j7mg) |

### 5.2 Remediation

- **dompurify / monaco-editor:** `npm audit fix`
- **electron:** `npm audit fix --force` (breaking; upgrade in dedicated pass)

---

## 6. Lint (TypeScript)

| Check | Result |
|-------|--------|
| `npm run lint` (tsc --noEmit) | **PASS** |

---

## 7. Build (production)

| Check | Result |
|-------|--------|
| `npm run build` (vite build) | **PASS** |
| Chunk size | `chunkSizeWarningLimit: 1500` in vite.config.ts |

---

## 8. Backend API

| Endpoint | Method | Status | Notes |
|----------|--------|--------|------|
| `/api/auth/session` | POST | ✅ | Returns/create userId (mock auth). |
| `/api/users/:userId/projects` | GET | ✅ | List projects (SQLite). |
| `/api/users/:userId/projects` | POST | ✅ | Create project; body `{ name }`. |
| `/api/users/:userId/projects/:projectId` | GET | ✅ | Get project (code, package_json, chat_messages). |
| `/api/users/:userId/projects/:projectId` | PUT | ✅ | Update project. |
| `/api/agent/config` | GET | ✅ | agentId, systemPrompt, preCodeQuestions. |
| `/api/agent/chat` | POST | ✅ | Grok chat; body `{ messages }`. |
| `/api/create-checkout-session` | POST | ✅ | Stripe Checkout; body `{ plan }`; env: STRIPE_* . |
| `/api/update-paid-status` | POST | ✅ | Body `{ plan, userId }`; Supabase upsert. |
| `/api/deploy` | POST | ✅ | Mock. |
| `/api/netlify/hook` | POST | ✅ | Mock. |

---

## 9. Summary

| Area | Result |
|------|--------|
| **Port** | 3000 (dev), 4173 (preview). |
| **Login/Sign up** | Fixed for static deploy; demo mode when no backend; no 404s. |
| **Stripe** | Checkout session + success → update-paid-status; deploy gated by paid. |
| npm audit | 3 moderate (dompurify/monaco, electron). |
| Lint | Pass. |
| Build | Pass. |

---

## 10. Recommendations

1. **Security:** Run `npm audit fix`; upgrade Electron in a separate pass if needed.
2. **Supabase:** Ensure `users` table has `id`, `paid`, `plan`; RLS allows backend upsert.
3. **Manual test:** Login → Dashboard → Start with Grok (demo or real). Upgrade to Deploy → Stripe Checkout (test) → confirm paid state and deploy.

---

*Report generated from workspace state.*
