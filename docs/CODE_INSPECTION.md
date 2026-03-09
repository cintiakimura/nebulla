# Code inspection (Mar 2026)

Quick audit of the kyn codebase: routing, auth, API usage, backend routes, and TypeScript.

## Status: OK

- **App & routing:** `main.tsx`, `App.tsx`, and all routes are consistent.
- **Auth:** Login uses Supabase when `VITE_SUPABASE_*` are set; `getUserId` / session flow and backend session endpoint align.
- **API client:** `getApiBase()`, backend-unavailable handling, and usage in Dashboard, Builder, and Login are correct.
- **Backend (`server.ts`):** Session, projects, Grok chat, TTS, Builder generate, Stripe checkout, update-paid-status; CORS and env guards in place.
- **Stripe success:** Builder reads `?paid=true&plan=...`, calls `/api/update-paid-status` with `userId`, updates local state.
- **DB:** `db.ts` and project CRUD match server routes.
- **Env:** `vite-env.d.ts` declares `VITE_*`; `.env.example` documents variables.

## Fixes applied

1. **Production start:** `npm start` now runs `tsx server.ts` (was `node server.ts`). `tsx` added to `dependencies` so deploy hosts can start the server.
2. **Stripe:** `.env.example` clarifies use of **price** IDs (`price_xxx`), not product IDs.
3. **Login.tsx:** Replaced `React.FormEvent` with `FormEvent` from React so `tsc --noEmit` passes.

## Checks

- `npm run lint` (tsc --noEmit): passes.
- `npm run build`: passes (run locally before deploy).
