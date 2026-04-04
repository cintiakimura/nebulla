# AGENTS.md — AI / Cursor agent instructions

This app is **Nebulla**. The repo is **backend-first**: secrets and vendor APIs live in the **host environment** (`.env`, Vercel, Railway). The browser is UI + OAuth redirects only (except optional local secret overrides in Settings).

**Vercel manager (in-app):** `GET /api/vercel/status`, `POST /api/vercel/command` (JSON `{ "message": "deploy" | "preview" | "list domains" | "add domain example.com" | "analytics" | "firewall" | … }`), `POST /api/vercel/blob` (JSON `{ filename, contentBase64, contentType? }`). Server uses `Authorization: Bearer` from `VERCEL_TOKEN` or `VERCEL_ACCESS_TOKEN`; Blob uses `BLOB_READ_WRITE_TOKEN`.

## Read first

- **`UNBREAKABLE_RULES.md`** — platform rules, npm scripts, env discovery, `STRICT_SERVER_API_KEYS`, VETR verify.
- **`docs/BACKEND_FIRST.md`** — service → env map (Grok, Supabase, Stitch, Stripe).

## Integrations (no Builder.io)

- **Grok (xAI):** `XAI_API_KEY` or `GROK_API_KEY` — chat, TTS, images, realtime token.
- **Google Stitch:** `STITCH_API_KEY` or `GOOGLE_STITCH_API_KEY` — **`POST /api/stitch/generate`** for UI generation from the Builder page (`@google/stitch-sdk` on the server).
- **Supabase / Stripe:** see `.env.example`.

## Do not

- Paste or ask users to paste secrets into chat.
- Add Builder.io SDK, `@builder.io/*`, `/api/builder/*`, or `.builderrules` — UI generation is **Stitch only**.

## Verify after API / server changes

```bash
npm run lint && npm run build && npm run test:all:server
```
