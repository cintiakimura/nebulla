# kyn — Full functionality test report

**Date:** 2026-03-08  
**Command:** `START_SERVER=1 node scripts/test-all.mjs`

---

## Summary

| Total | Passed | Failed |
|-------|--------|--------|
| 14 | 13 | 1 |

---

## 1. Auth / Login-Sign up (session)

| Test | Result | Note |
|------|--------|------|
| POST /api/auth/session (no body) returns userId | PASS | Session created with new UUID |
| POST /api/auth/session (with userId) echoes userId | PASS | Echoes provided userId |

**Conclusion:** Login/Sign up session flow works. Client can get or pass userId via `/api/auth/session`.

---

## 2. Projects (CRUD + limits)

| Test | Result | Note |
|------|--------|------|
| GET /api/users/:userId/projects | PASS | Returns array (list) |
| GET /api/users/:userId/limits | PASS | limit=3 (FREE_PROJECT_LIMIT) |
| POST /api/users/:userId/projects | PASS | Creates project, returns id/name |
| GET /api/users/:userId/projects/:id | PASS | Returns project (code, package_json, etc.) |
| PUT /api/users/:userId/projects/:id | PASS | Update name/last_edited ok |

**Conclusion:** Projects list, create, get, update and limits endpoint work.

---

## 3. Agent config (Grok)

| Test | Result | Note |
|------|--------|------|
| GET /api/agent/config | PASS | agentId=grok-eve, preCodeQuestions array |

**Conclusion:** Agent config endpoint works.

---

## 4. Agent chat (Grok)

| Test | Result | Note |
|------|--------|------|
| POST /api/agent/chat | PASS | reply received (GROK_API_KEY set in env) |

**Conclusion:** Grok chat works when `GROK_API_KEY` is set.

---

## 5. UI generation (Google Stitch)

| Test | Result | Note |
|------|--------|------|
| POST /api/stitch/generate | PASS | 503 — STITCH_API_KEY not set (expected when key not in .env) |

**Conclusion:** Endpoint responds; returns 503 with message when Stitch key is not configured. With `STITCH_API_KEY` set, expect 200 and `code` in response.

---

## 6. Stripe & update-paid-status

| Test | Result | Note |
|------|--------|------|
| POST /api/create-checkout-session | **FAIL** | 500 — Checkout session failed |
| POST /api/update-paid-status | PASS | 503 — Supabase not configured (expected when Supabase not set) |

**Failure detail:** Stripe is configured (STRIPE_SECRET_KEY set) but the handler returns 500. Common cause: `STRIPE_PROTOTYPE_PRICE_ID` or `STRIPE_KING_PRO_PRICE_ID` must be a **Price ID** (`price_xxx`), not a Product ID (`prod_xxx`). If your .env has `prod_...`, create a Price in Stripe Dashboard and set `STRIPE_PROTOTYPE_PRICE_ID=price_xxx`.

**Conclusion:** update-paid-status behaves as expected when Supabase is not configured. Fix Stripe price IDs to get checkout session passing.

---

## 7. Deploy mocks

| Test | Result | Note |
|------|--------|------|
| POST /api/deploy | PASS | mock ok |
| POST /api/netlify/hook | PASS | mock ok |

**Conclusion:** Mock deploy endpoints respond.

---

## How to run tests

- **With server auto-started (recommended):**  
  `START_SERVER=1 node scripts/test-all.mjs`  
  (Starts server on port 3077, runs tests, stops server.)

- **Against existing server:**  
  Start server with `npm run dev`, then:  
  `node scripts/test-all.mjs`  
  Or: `node scripts/test-all.mjs http://localhost:3001`

- **NPM scripts:**  
  - `npm run test:all` — run against http://localhost:3000 (server must be running).  
  - `npm run test:all:server` — same as `START_SERVER=1 node scripts/test-all.mjs` (macOS/Linux).

---

## Raw output (last run)

```
=== kyn full functionality test ===

Starting server on port 3077...
Server ready.

--- 1. Auth / Login-Sign up (session) ---
  [PASS] POST /api/auth/session returns userId
  [PASS] POST /api/auth/session echoes userId

--- 2. Projects ---
  [PASS] GET /api/users/:userId/projects
  [PASS] GET /api/users/:userId/limits — limit=3
  [PASS] POST /api/users/:userId/projects — id=...
  [PASS] GET /api/users/:userId/projects/:id
  [PASS] PUT /api/users/:userId/projects/:id

--- 3. Agent config ---
  [PASS] GET /api/agent/config — agentId=grok-eve

--- 4. Agent chat (Grok) ---
  [PASS] POST /api/agent/chat — reply received

--- 5. UI generation (Google Stitch) ---
  [PASS] POST /api/stitch/generate — 503 (STITCH_API_KEY not set)

--- 6. Stripe & update-paid-status ---
  [FAIL] POST /api/create-checkout-session — 500
  [PASS] POST /api/update-paid-status — 503 (Supabase not configured)

--- 7. Deploy mocks ---
  [PASS] POST /api/deploy — mock ok
  [PASS] POST /api/netlify/hook — mock ok

Server stopped.

=== REPORT ===
Total: 14  Passed: 13  Failed: 1
Failed: POST /api/create-checkout-session 500
--- End of report ---
```

---

## Recommendations

1. **Stripe:** Use Price IDs (`price_xxx`) in `.env` for `STRIPE_PROTOTYPE_PRICE_ID` and `STRIPE_KING_PRO_PRICE_ID` so create-checkout-session returns 200.
2. **Google Stitch:** Set `STITCH_API_KEY` in `.env` to test UI generation with a real code response.
3. **Supabase:** Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` to test update-paid-status with a real users table.

---

*Report generated from test run. Re-run tests with `START_SERVER=1 node scripts/test-all.mjs`.*
