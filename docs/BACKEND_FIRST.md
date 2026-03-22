# Backend-first integrations (one Git repo)

This app is structured so **secrets and vendor APIs** are controlled from the **host environment** (`.env` / Vercel variables) and **one HTTP API**.

## What runs on the backend

| Service | How |
|--------|-----|
| **Grok (xAI)** | `XAI_API_KEY` or `GROK_API_KEY` — chat, TTS, images, realtime token via `/api/*` |
| **Supabase** | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` — DB, auth validation, RLS bypass on server only |
| **Google Stitch** | `STITCH_API_KEY` or `GOOGLE_STITCH_API_KEY` — `POST /api/stitch/generate` (optional `STITCH_PROJECT_ID`) |
| **Stripe** | `STRIPE_SECRET_KEY`, webhooks — server only |
| **Vercel** | Host + optional `VERCEL_ACCESS_TOKEN` + `VERCEL_PROJECT_ID` for `GET /api/integrations/summary` metadata |

## What the browser still does

- **UI** (React).
- **OAuth** redirect to Google/GitHub (then return to `/auth/callback`).
- **Optional** local overrides (`Settings → Secrets`) sent as `x-grok-api-key` / `x-stitch-api-key` unless you set **`STRICT_SERVER_API_KEYS=1`**.

## Discoverability (no secret values)

- `GET /api/integrations/summary` — one JSON map: what is configured + optional Vercel project name / latest deployment.
- `GET /api/config/secrets-audit` — per-env boolean checklist.
- `GET /api/config/production-readiness` — checklist text + core gaps.

## Production hardening

Set on the server:

```bash
STRICT_SERVER_API_KEYS=1
```

Then Grok and Stitch **only** use keys from the host env (browser header overrides ignored).

## Optional Vercel API link

1. Vercel → Account Settings → **Tokens** → create token → `VERCEL_ACCESS_TOKEN`
2. Project → Settings → General → **Project ID** → `VERCEL_PROJECT_ID`

Redeploy. **Refresh env check** in Settings will show project + latest deployment in the integrations card.
