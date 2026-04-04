# xAI Console: API Key Setup (Grok + Eve TTS + Voice)

Go to: https://console.x.ai → API Keys → Create or edit your key (name it "Nebula-Grok" or whatever).

## Best Way: Turn Restrict Access OFF
- One key, no headaches—works for chat, TTS, realtime.  
- If you leave it ON, you **must** check:  
  - **Chat** (/v1/chat/completions) — for all reasoning + agents  
  - **TTS** (/v1/tts) — for Eve voice (voice_id: "eve")  
  - **Realtime / Voice** — for WebSocket if you use live voice (optional)  
  - Models: Add "grok-4-1-fast-reasoning" (and any others you test)  

Missing Chat? Builder + agents 400 error. Missing TTS? No voice.

## Key in Code
- Env var: `XAI_API_KEY` or `GROK_API_KEY_NEBULLA` (same in .env.example)  
- Model: **always** "grok-4-1-fast-reasoning" (hyphens, no dots)  
- TTS endpoint: POST /v1/tts with { "text": "...", "voice_id": "eve" }  

## Locked Flow (what Nebula does)
1. Reasoning: POST /v1/chat/completions → model "grok-4-1-fast-reasoning"  
2. Speak: POST /v1/tts → voice_id "eve" (backend proxy: /api/tts)  

After update: wait 30 seconds, retry—no deploy needed unless key string changed.