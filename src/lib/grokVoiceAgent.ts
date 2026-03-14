/**
 * Grok Voice Agent API (WebSocket) — real-time speech.
 * Use ephemeral token from backend; connect to wss://api.x.ai/v1/realtime.
 * Fallback to REST TTS or browser SpeechSynthesis when WebSocket fails.
 */


const REALTIME_URL = "wss://api.x.ai/v1/realtime";
const SAMPLE_RATE = 24000;

export type VoiceAgentResult = "played" | "fallback";

export type RealtimeTokenResult = { token: string | null; grokKeyMissing?: boolean };

/** Get ephemeral token from our backend (POST /api/realtime/token). */
export async function getRealtimeToken(apiBase: string): Promise<RealtimeTokenResult> {
  const url = `${apiBase || ""}/api/realtime/token`;
  if (!url.startsWith("http") && !url.startsWith("/")) return { token: null };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const grokKeyMissing = res.status === 503 && text.toLowerCase().includes("grok");
    return { token: null, grokKeyMissing };
  }
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!data || typeof data !== "object") return { token: null };
  const token =
    typeof (data as { client_secret?: string }).client_secret === "string"
      ? (data as { client_secret: string }).client_secret
      : typeof (data as { value?: string }).value === "string"
        ? (data as { value: string }).value
        : null;
  return { token };
}

/** Decode base64 PCM16 to Int16Array. */
function base64ToPcm16(base64: string): Int16Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

/** Play PCM16 at 24kHz via AudioContext (stereo = 2 ch for compatibility). */
function playPcm16(audioContext: AudioContext, pcm16: Int16Array, sampleRate: number): void {
  const float32 = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 32768;
  const buffer = audioContext.createBuffer(1, float32.length, sampleRate);
  buffer.getChannelData(0).set(float32);
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);
  source.start();
}

/**
 * Speak text via Grok Voice Agent WebSocket (text-in → audio-out).
 * Returns "played" if audio was streamed and played, "fallback" if caller should use TTS/SpeechSynthesis.
 */
export function speakViaVoiceAgent(
  apiBase: string,
  text: string,
  options: {
    instructions?: string;
    voice?: string;
    onDone?: () => void;
    onTranscript?: (text: string) => void;
  } = {}
): Promise<VoiceAgentResult> {
  const { instructions = "You are Kyn, a concise dev partner.", voice = "Eve", onDone, onTranscript } = options;
  return new Promise(async (resolve) => {
    let token: string | null = null;
    try {
      const result = await getRealtimeToken(apiBase);
      token = result.token;
    } catch {
      resolve("fallback");
      onDone?.();
      return;
    }
    if (!token || !text.trim()) {
      resolve("fallback");
      onDone?.();
      return;
    }

    const ws = new WebSocket(REALTIME_URL, [`xai-client-secret.${token}`]);
    const audioChunks: string[] = [];
    let transcriptParts: string[] = [];
    let audioContext: AudioContext | null = null;
    const noop = () => {};
    let resolveOnce: (r: VoiceAgentResult) => void = (r: VoiceAgentResult) => {
      resolveOnce = noop;
      resolve(r);
      onDone?.();
    };

    ws.onopen = () => {
      audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({
        sampleRate: SAMPLE_RATE,
      });
      ws.send(
        JSON.stringify({
          type: "session.update",
          session: {
            voice,
            instructions,
            turn_detection: { type: "server_vad" as const },
            audio: {
              input: { format: { type: "audio/pcm" as const, rate: SAMPLE_RATE } },
              output: { format: { type: "audio/pcm" as const, rate: SAMPLE_RATE } },
            },
          },
        })
      );
      ws.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: text.trim().slice(0, 4096) }],
          },
        })
      );
      ws.send(JSON.stringify({ type: "response.create", response: { modalities: ["text", "audio"] } }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as { type?: string; delta?: string };
        if (data.type === "response.output_audio.delta" && typeof data.delta === "string") {
          audioChunks.push(data.delta);
        }
        if (data.type === "response.output_audio_transcript.delta" && typeof (data as { delta?: string }).delta === "string") {
          transcriptParts.push((data as { delta: string }).delta);
        }
        if (data.type === "response.output_audio_transcript.done") {
          const full = transcriptParts.join("");
          if (full) onTranscript?.(full);
          transcriptParts = [];
        }
        if (data.type === "response.done" || data.type === "response.output_audio.done") {
          if (data.type === "response.done" && transcriptParts.length > 0) {
            onTranscript?.(transcriptParts.join(""));
          }
          if (audioChunks.length > 0 && audioContext) {
            const combined = audioChunks.join("");
            const pcm = base64ToPcm16(combined);
            playPcm16(audioContext, pcm, SAMPLE_RATE);
            resolveOnce("played");
          } else {
            resolveOnce("fallback");
          }
          ws.close();
        }
      } catch (_) {}
    };

    ws.onerror = () => {
      resolveOnce("fallback");
      ws.close();
    };
    ws.onclose = () => {
      if (audioChunks.length > 0 && audioContext && resolveOnce !== noop) {
        try {
          const combined = audioChunks.join("");
          const pcm = base64ToPcm16(combined);
          playPcm16(audioContext, pcm, SAMPLE_RATE);
          resolveOnce("played");
        } catch {
          resolveOnce("fallback");
        }
      } else if (resolveOnce !== noop) {
        resolveOnce("fallback");
      }
      onDone?.();
    };

    const t = setTimeout(() => {
      if (ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
        ws.close();
        resolveOnce("fallback");
      }
    }, 30000);
    ws.addEventListener("close", () => clearTimeout(t), { once: true });
  });
}

/**
 * Browser SpeechSynthesis fallback with resume hack for long text (many engines stop after ~200 chars).
 */
export function speakWithSpeechSynthesisFallback(
  text: string,
  onEnd?: () => void
): () => void {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    onEnd?.();
    return () => {};
  }
  const maxChunk = 200;
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += maxChunk) chunks.push(text.slice(i, i + maxChunk));
  let index = 0;
  let cancelled = false;

  const speakNext = () => {
    if (cancelled || index >= chunks.length) {
      onEnd?.();
      return;
    }
    const u = new SpeechSynthesisUtterance(chunks[index]);
    u.rate = 0.95;
    u.onend = () => {
      index++;
      if (index < chunks.length) setTimeout(speakNext, 80);
      else onEnd?.();
    };
    u.onerror = () => {
      index++;
      if (index < chunks.length) setTimeout(speakNext, 80);
      else onEnd?.();
    };
    window.speechSynthesis.speak(u);
  };
  speakNext();
  return () => {
    cancelled = true;
    window.speechSynthesis.cancel();
  };
}
