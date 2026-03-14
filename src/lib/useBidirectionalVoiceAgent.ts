/**
 * Bidirectional Grok Voice Agent: mic → WebSocket (PCM deltas) → play response audio.
 * Buffers mic until session.updated, then streams via input_audio_buffer.append.
 * Server VAD commits turns; we play output_audio.delta and surface transcripts.
 */

import { useRef, useCallback, useState } from "react";
import { getRealtimeToken } from "./grokVoiceAgent";

const REALTIME_URL = "wss://api.x.ai/v1/realtime";
const SAMPLE_RATE = 24000;
const MIC_SAMPLE_RATE = 48000; // capture at 48k, downsample to 24k for API

const KYN_PLANNING_INSTRUCTIONS = `You are Kyn, the user's dev partner. Guide them through planning their app in 7-8 steps:
1) Objective & Scope — goal, must-have flows, who wins.
2) Users & Roles — actors and access.
3) Data & Models — tables, relations, PII/sensitive.
4) Constraints — offline, GDPR, budget, scale.
5) Branding — colors, fonts, vibe, logo (they can upload later).
6) Pages & Navigation — core screens, public/private, nav style.
7) Optional: Competition — industry/users/revenue/pricing.
8) Optional: Pricing tiers.

Start with: "Let's go. What's your idea? Describe what you're building." Ask one theme at a time. Keep replies concise. When you have a strong foundation say: "Strong foundation. Ready to generate UI?"`;

function base64ToPcm16(base64: string): Int16Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

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

/** Float32 48k → PCM16 24k (downsample by 2), then base64 */
function float32ToBase64Pcm24k(float32: Float32Array): string {
  const len24 = Math.floor(float32.length / 2);
  const pcm16 = new Int16Array(len24);
  for (let i = 0; i < len24; i++) {
    const s = Math.max(-1, Math.min(1, float32[i * 2]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(pcm16.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export type VoiceAgentStatus = "idle" | "connecting" | "listening" | "speaking" | "error";

export function useBidirectionalVoiceAgent(apiBase: string, options: {
  instructions?: string;
  voice?: string;
  onUserTranscript?: (text: string) => void;
  onAssistantTranscript?: (text: string) => void;
  onError?: (message: string) => void;
}) {
  const { instructions = KYN_PLANNING_INSTRUCTIONS, voice = "Eve", onUserTranscript, onAssistantTranscript, onError } = options;
  const [status, setStatus] = useState<VoiceAgentStatus>("idle");
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sessionReadyRef = useRef(false);
  const micBufferRef = useRef<string[]>([]);
  const outputChunksRef = useRef<string[]>([]);
  const transcriptRef = useRef<string[]>([]);
  const playContextRef = useRef<AudioContext | null>(null);
  const errorRef = useRef(false);

  const close = useCallback(() => {
    errorRef.current = false;
    if (processorRef.current && audioContextRef.current) {
      try {
        processorRef.current.disconnect();
      } catch (_) {}
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    sessionReadyRef.current = false;
    setStatus("idle");
  }, []);

  const start = useCallback(async () => {
    if (status === "listening" || status === "connecting") return;
    setStatus("connecting");
    let token: string | null = null;
    let grokKeyMissing = false;
    try {
      const result = await getRealtimeToken(apiBase);
      token = result.token;
      grokKeyMissing = result.grokKeyMissing ?? false;
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Failed to get token");
      setStatus("error");
      return;
    }
    if (!token) {
      onError?.(grokKeyMissing ? "Add your Grok API key in Settings." : "Voice token not available. Check GROK_API_KEY.");
      setStatus("error");
      return;
    }

    const ws = new WebSocket(REALTIME_URL, [`xai-client-secret.${token}`]);
    wsRef.current = ws;
    outputChunksRef.current = [];
    transcriptRef.current = [];

    ws.onopen = () => {
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
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as {
          type?: string;
          delta?: string;
          transcript?: string;
          item_id?: string;
        };
        switch (data.type) {
          case "session.updated":
            sessionReadyRef.current = true;
            setStatus("listening");
            micBufferRef.current.forEach((chunk) => {
              if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: "input_audio_buffer.append", audio: chunk }));
              }
            });
            micBufferRef.current = [];
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({
                type: "conversation.item.create",
                item: { type: "message", role: "user", content: [{ type: "input_text", text: "Let's start the planning conversation." }] },
              }));
              wsRef.current.send(JSON.stringify({ type: "response.create", response: { modalities: ["text", "audio"] } }));
            }
            break;
          case "conversation.item.input_audio_transcription.completed":
            if (typeof (data as { transcript?: string }).transcript === "string") {
              onUserTranscript?.((data as { transcript: string }).transcript);
            }
            break;
          case "response.output_audio_transcript.delta":
            if (typeof (data as { delta?: string }).delta === "string") {
              transcriptRef.current.push((data as { delta: string }).delta);
            }
            break;
          case "response.output_audio_transcript.done":
            const full = transcriptRef.current.join("");
            transcriptRef.current = [];
            if (full) onAssistantTranscript?.(full);
            break;
          case "response.output_audio.delta":
            if (typeof data.delta === "string") outputChunksRef.current.push(data.delta);
            break;
          case "response.output_audio.done":
          case "response.done":
            setStatus("speaking");
            const chunks = outputChunksRef.current;
            outputChunksRef.current = [];
            if (chunks.length > 0 && playContextRef.current) {
              try {
                const combined = chunks.join("");
                const pcm = base64ToPcm16(combined);
                playPcm16(playContextRef.current, pcm, SAMPLE_RATE);
              } catch (_) {}
            }
            setStatus("listening");
            break;
          default:
            break;
        }
      } catch (_) {}
    };

    ws.onerror = () => {
      errorRef.current = true;
      onError?.("WebSocket error");
      setStatus("error");
    };
    ws.onclose = () => {
      wsRef.current = null;
      if (!errorRef.current) setStatus("idle");
    };

    playContextRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({ sampleRate: SAMPLE_RATE });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({ sampleRate: MIC_SAMPLE_RATE });
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const base64 = float32ToBase64Pcm24k(new Float32Array(input));
        if (sessionReadyRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "input_audio_buffer.append", audio: base64 }));
        } else {
          micBufferRef.current.push(base64);
          if (micBufferRef.current.length > 120) micBufferRef.current.shift();
        }
      };
      source.connect(processor);
      processor.connect(ctx.destination);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Microphone access denied");
      setStatus("error");
      ws.close();
    }
  }, [apiBase, instructions, voice, status, onUserTranscript, onAssistantTranscript, onError]);

  const stop = useCallback(() => {
    close();
  }, [close]);

  return { start, stop, status, close };
}
