/**
 * xAI Grok — one API key for chat + TTS. We do not use /v1/responses here.
 * Chat: POST /v1/chat/completions. Read-aloud: POST /v1/tts (proxied as POST /api/tts), voice_id eve.
 */

export const XAI_CHAT_COMPLETIONS_URL = "https://api.x.ai/v1/chat/completions";
export const XAI_TTS_URL = "https://api.x.ai/v1/tts";

/** xAI /v1/tts expects a language code (e.g. en); missing language often yields HTTP 422. */
export const XAI_TTS_DEFAULT_LANGUAGE = "en";

/** Default model for /api/agent/chat when GROK_MODEL is unset. */
export const GROK_CHAT_COMPLETIONS_MODEL = "grok-4-1-fast-reasoning";
