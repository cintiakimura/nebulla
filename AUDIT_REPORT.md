# kyn — Audit test report

**Date:** 2026-03-10  
**Branch:** main

---

## 1. Audit run summary

| Check | Command | Result | Notes |
|-------|---------|--------|-------|
| **Security** | `npm audit` | ✅ 0 vulnerabilities | — |
| **Lint** | `npm run lint` (tsc --noEmit) | ✅ PASS | Exit code 0 |
| **Build** | `npm run build` (vite build) | ✅ PASS | ~21s, dist/ produced |
| **API tests** | `npm run test:all:server` | ✅ 13/13 PASS | Server auto-starts on port 3077, SQLite + open-mode |

---

## 2. npm audit (security)

**Current status:** `npm audit` reports **0 vulnerabilities**.

```
found 0 vulnerabilities
```

---

## 3. Lint (TypeScript)

| Check | Result |
|-------|--------|
| `npm run lint` | ✅ PASS |
| Exit code | 0 |
| Tool | `tsc --noEmit` |

No type or emit errors reported.

---

## 4. Build (production)

| Check | Result |
|-------|--------|
| `npm run build` | ✅ PASS |
| Tool | Vite 6.x |
| Output | `dist/` |
| Duration | ~21s |

### Build artifacts (sample)

| File | Size (gzip) |
|------|-------------|
| dist/index.html | 0.55 kB (0.37 kB gzip) |
| dist/assets/index-*.css | ~56 kB (~10 kB gzip) |
| dist/assets/index-*-*.js (chunks) | Multiple; largest ~1,592 kB (~502 kB gzip) |

*(Note: Some chunks >1500 kB; consider code-splitting.)*

---

## 5. API tests (`npm run test:all:server`)

Full functionality test: server is started with `OPEN_MODE_FALLBACK_USER_ID=test-open-mode-user`, `OPEN_MODE_ORIGIN=` (empty), and SQLite (Supabase env cleared) so all checks run without external services.

### Test output (2026-03-10)

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
  [PASS] POST /api/builder/generate — 503 (STITCH_API_KEY not set)

--- 6. Stripe & update-paid-status (410 = removed) ---
  [PASS] POST /api/create-checkout-session — 410 (payments removed)
  [PASS] POST /api/update-paid-status — 410 (payments removed)

--- 7. Deploy mocks ---
  [PASS] POST /api/deploy — mock ok

=== REPORT ===
Total: 13  Passed: 13  Failed: 0
--- End of report ---
```

### How to re-run

- **With server auto-start:** `npm run test:all:server` (starts server on 3077, runs tests, stops server).
- **With existing server:** `node scripts/test-all.mjs http://localhost:3000` (or your base URL).

---

## 6. Backend API endpoints

| Endpoint | Method | Status | Notes |
|----------|--------|--------|------|
| `/api/auth/session` | POST | ✅ | Returns/creates userId (mock auth). |
| `/api/users/:userId/projects` | GET | ✅ | List projects (SQLite/Supabase). |
| `/api/users/:userId/limits` | GET | ✅ | Returns `{ projectLimit }` (FREE_PROJECT_LIMIT). |
| `/api/users/:userId/projects` | POST | ✅ | Create project; body `{ name }`; 403 when free limit reached. |
| `/api/users/:userId/projects/:projectId` | GET | ✅ | Get project (code, package_json, chat_messages). |
| `/api/users/:userId/projects/:projectId` | PUT | ✅ | Update project. |
| `/api/agent/config` | GET | ✅ | agentId, systemPrompt, preCodeQuestions. |
| `/api/agent/chat` | POST | ✅ | Grok chat; body `{ messages }`; GROK_API_KEY. |
| `/api/builder/generate` | POST | ✅ | Google Stitch; 503 if STITCH_API_KEY not set. |
| `/api/create-checkout-session` | POST | ✅ | **410 Gone** (payments removed). |
| `/api/update-paid-status` | POST | ✅ | **410 Gone** (payments removed). |
| `/api/deploy` | POST | ✅ | Mock. |

---

## 7. Dev server & ports

| Item | Value |
|------|--------|
| Dev server port | `process.env.PORT` or **3000** |
| Start command | `npm run dev` (tsx server.ts → Express + Vite) |
| Test server port (test:all:server) | **3077** |
| Preview (static only) | `npm run preview` → Vite default (e.g. 4173) |

---

## 8. Known npm warnings (safe to ignore)

- **npm warn Unknown env config "devdir"** — npm config; does not affect build or run.
- **prebuild-install** (better-sqlite3) — deprecation from transitive dep; still works.
- **intersection-observer** — from Sandpack dependency.
- **boolean** — optional dependency; no action needed.

---

## 9. Summary

| Area | Result |
|------|--------|
| Security (npm audit) | ✅ 0 vulnerabilities |
| Lint | ✅ Pass |
| Build | ✅ Pass |
| API tests | ✅ 13/13 pass (test:all:server) |
| Payments | 410 Gone (Stripe removed); audit treats 410 as pass |

---

## 10. Re-verify commands

```bash
npm run lint
npm run build
npm audit
npm run test:all:server
```

---

*Report generated from audit run (npm audit, npm run lint, npm run build, npm run test:all:server).*
