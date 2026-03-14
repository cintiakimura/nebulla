# Voice Agent + Deploy (final push)

## What was implemented

1. **Bidirectional Grok Voice Agent** (`src/lib/useBidirectionalVoiceAgent.ts`)
   - Mic → WebSocket: capture at 48kHz, downsample to 24k PCM, send via `input_audio_buffer.append` after `session.updated`.
   - Server VAD commits turns; Grok replies with audio; we play `response.output_audio.delta` (PCM).
   - First message: "Let's start the planning conversation." → Grok says "Let's go. What's your idea?"
   - Instructions enforce 7–8 step wizard (Objective → Users → Data → Constraints → Branding → Pages → optional Competition/Pricing).

2. **Dashboard**
   - Voice (Grok) mode by default: mic starts/stops the WebSocket agent; transcripts and replies appear in chat.
   - Partial plan persistence: on first user message we create a "Planning" draft project; after each assistant message we PUT `plan: { chat_history }` to that project.
   - Fallback: if Voice Agent fails (token/quota), user can switch to text + REST + TTS (toggle or use text input when available).

3. **Mind map**
   - "Show mind map" (Network icon in chat header): sends conversation to Grok with a prompt for JSON `{ nodes, edges }`; we parse and render with `MindMapFromPlan` (React Flow).
   - Central node "App Idea" + branches per planning theme.

4. **VS Code–style layout**
   - `react-resizable-panels`: Group + Panel + Separator; main (55%) and chat (30%) resizable.
   - Status bar at bottom: accent background, project count.
   - Left sidebar unchanged (5–7% width).

## Test locally

```bash
npm run dev
# Open http://localhost:3000
# Complete first-time onboarding (or skip if already done)
# Click "Voice (Grok)" in chat → allow mic → say "build a todo app"
# Grok should reply aloud and ask follow-ups; keep talking or type.
# Click Network icon → "Show mind map" after a few exchanges.
```

## Commit & deploy

```bash
git add -A
git commit -m "feat: wire Grok Voice Agent for bidirectional planning convo + wizard guidance + mind map basics"
git push origin main
```

- **Vercel**: Ensure env vars: `GROK_API_KEY`, Supabase (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`), and optionally `OPEN_MODE_FALLBACK_USER_ID`.
- **Voice API cost**: ~$0.05/min (xAI). If quota/cost is a concern, use REST + TTS for reply only (disable "Voice (Grok)" or fallback when token fails).

## Deliverables

- Vercel URL after deploy.
- Short video or screenshots: voice onboarding → planning questions (multi-turn) → mind map render.
