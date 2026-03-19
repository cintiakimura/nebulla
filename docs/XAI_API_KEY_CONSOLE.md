# xAI console: API key for kyn (Grok + Eve TTS + voice)

Use **https://console.x.ai** → **API keys** → select or create your key (e.g. `kyn-4.2.multi-agent`).

## Option A — Simplest (recommended)

Turn **Restrict access** **OFF**.

One key then works for every endpoint kyn calls, including models you add later.

## Option B — Restrict access stays ON

Enable **all** of the following that appear in the console:

| What kyn uses | xAI area to allow |
|---------------|-------------------|
| Chat, multi-agent code pipeline | **Chat** — `/v1/chat/completions` (and `/v1/responses` if grouped together) |
| Read-aloud (Eve) in Builder / onboarding | **TTS** — `/v1/tts` with voice **`eve`** |
| Voice Agent WebSocket (optional) | **Realtime / Voice** — paths under `/v1/realtime` (ephemeral token) |
| Models | The Grok IDs you actually set in env (e.g. `grok-4-1-fast-reasoning`, `GROK_MODEL`, `GROK_CODE_AGENT_MODEL`) |

If **Chat** is unchecked, **Builder chat and agents will fail** even if models are checked.

**Note:** The REST endpoint is **`/v1/tts`** (text-to-speech), not `v1/ttss`. kyn sends `voice_id: "eve"` by default (`server.ts` / `api/index.ts` → `https://api.x.ai/v1/tts`).

## Same key everywhere

Server env: **`XAI_API_KEY`** or **`GROK_API_KEY`** (see `.env.example`). Chat (`/v1/chat/completions`), TTS (`/v1/tts` → `/api/tts`), and realtime token routes use the same key.

## What kyn does (locked)

1. **Reason:** `POST /v1/chat/completions` with model **`grok-4-1-fast-reasoning`** unless `GROK_MODEL` is set.
2. **Speak:** `POST /v1/tts` with **`voice_id: "eve"`** (via backend `POST /api/tts`). No extra keys.

After changes in the console, wait a minute and retry; no code deploy is required unless the key string itself changed.
