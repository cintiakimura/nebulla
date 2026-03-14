import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { Mic } from "lucide-react";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import { getApiBase } from "../lib/api";

const INTRO_SCRIPT =
  "Hey, I'm Kyn, your dev partner. Most people rush into code and end up with bugs and frustration. We talk first, plan architecture, brainstorm together, get an airtight plan before writing any code.";
const PROMPT_READY =
  "If you're ready, just say \"I'm ready\" or tap the button.";
const OUTRO_SCRIPT = "Let's go. What's your idea? Describe what you're building.";

/** Play text using Grok voice (Eve) via backend TTS. No browser TTS. If no backend is configured, skips playback and calls onEnd (avoids 405 on frontend host). */
function playGrokEve(text: string, onEnd?: () => void, onGrokKeyMissing?: () => void): () => void {
  if (typeof window === "undefined") {
    onEnd?.();
    return () => {};
  }
  const apiBase = getApiBase() || "";
  const url = `${apiBase}/api/tts`;
  if (!url.startsWith("http") && !url.startsWith("/")) {
    onEnd?.();
    return () => {};
  }
  const audio = new Audio();
  let cancelled = false;

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice_id: "eve" }),
  })
    .then((res) => {
      if (cancelled) {
        onEnd?.();
        return null;
      }
      if (res.status === 503) {
        onGrokKeyMissing?.();
        return null;
      }
      if (!res.ok) {
        onEnd?.();
        return null;
      }
      return res.arrayBuffer();
    })
    .then((buf) => {
      if (cancelled || !buf) return;
      const blob = new Blob([buf], { type: "audio/mpeg" });
      const objectUrl = URL.createObjectURL(blob);
      audio.src = objectUrl;
      audio.onended = () => {
        URL.revokeObjectURL(objectUrl);
        onEnd?.();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        onEnd?.();
      };
      audio.play().catch(() => onEnd?.());
    })
    .catch(() => onEnd?.());

  return () => {
    cancelled = true;
    audio.pause();
    audio.src = "";
  };
}

type Step = "idle" | "speaking" | "waiting_ready" | "done";

type Props = {
  onComplete: () => void;
};

export default function FirstLoginOnboarding({ onComplete }: Props) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("idle");
  const [displayText, setDisplayText] = useState<string>("");
  const [showGrokKeyBanner, setShowGrokKeyBanner] = useState(false);
  const cancelPlayRef = useRef<(() => void) | null>(null);
  const onGrokMissing = () => setShowGrokKeyBanner(true);
  const { transcript, listening } = useSpeechRecognition();

  const handleLetsStart = () => {
    setStep("speaking");
    setDisplayText(INTRO_SCRIPT);
    cancelPlayRef.current?.();
    cancelPlayRef.current = playGrokEve(INTRO_SCRIPT, () => {
      setDisplayText(PROMPT_READY);
      cancelPlayRef.current = playGrokEve(PROMPT_READY, () => {
        setStep("waiting_ready");
        setDisplayText("");
        SpeechRecognition.startListening({ continuous: true });
      }, onGrokMissing);
    }, onGrokMissing);
  };

  const handleImReady = () => {
    SpeechRecognition.stopListening();
    cancelPlayRef.current?.();
    setStep("done");
    setDisplayText(OUTRO_SCRIPT);
    playGrokEve(OUTRO_SCRIPT, undefined, onGrokMissing);
  };

  useEffect(() => {
    if (step !== "waiting_ready" || !transcript) return;
    const t = transcript.trim().toLowerCase();
    if (/i'?m\s+ready|i am ready|ready/.test(t)) {
      handleImReady();
    }
  }, [step, transcript]);

  useEffect(() => {
    return () => {
      cancelPlayRef.current?.();
      SpeechRecognition.stopListening();
    };
  }, []);

  const isDone = step === "done";

  const handleFadeComplete = () => {
    if (isDone) onComplete();
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="onboarding"
        initial={{ opacity: 1 }}
        animate={{ opacity: isDone ? 0 : 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
        onAnimationComplete={handleFadeComplete}
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-vs-bg text-vs-foreground font-sans"
        style={{ pointerEvents: isDone ? "none" : "auto" }}
      >
        {showGrokKeyBanner && (
          <div className="absolute top-4 left-4 right-4 flex items-center justify-between gap-2 rounded-lg bg-amber-500/20 border border-amber-500/40 px-3 py-2 text-sm text-amber-200">
            <span>Voice is unavailable. Contact support if you need voice.</span>
            <button type="button" onClick={() => setShowGrokKeyBanner(false)} className="shrink-0 px-2 py-1 rounded bg-amber-500/30 hover:bg-amber-500/50 text-amber-100 text-xs font-medium">Dismiss</button>
          </div>
        )}
        <div className="flex flex-col items-center justify-center gap-10 px-6 max-w-2xl text-center">
          {step === "idle" && (
            <>
              <motion.div
                animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="flex items-center justify-center w-24 h-24 rounded-full bg-vs-hover border border-vs-border"
              >
                <Mic size={48} className="text-vs-accent" strokeWidth={1.5} />
              </motion.div>
              <p className="text-[15px] text-gray-400 leading-relaxed max-w-md">
                Kyn will introduce herself with Grok&apos;s voice (Eve). You can read along and say &ldquo;I&rsquo;m ready&rdquo; when you are.
              </p>
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.3 }}
                onClick={handleLetsStart}
                className="px-10 py-4 text-lg font-medium text-white rounded-lg btn-accent shadow-[0_0_32px_rgba(0,191,255,0.3)] hover:shadow-[0_0_40px_rgba(0,191,255,0.4)] transition-all duration-200"
              >
                Let&apos;s start
              </motion.button>
            </>
          )}

          {(step === "speaking" || step === "waiting_ready") && (
            <>
              <motion.div
                animate={{ scale: listening ? [1, 1.05, 1] : 1, opacity: listening ? 1 : 0.6 }}
                transition={{ duration: 1.2, repeat: listening ? Infinity : 0 }}
                className="flex items-center justify-center w-20 h-20 rounded-full bg-[#1a1a24] border border-[#2a2a3a]"
              >
                <Mic size={40} className="text-vs-accent" strokeWidth={1.5} />
              </motion.div>
              {displayText && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="w-full rounded-xl bg-vs-hover border border-vs-border p-6 text-left"
                >
                  <p className="text-[15px] text-gray-300 leading-relaxed whitespace-pre-wrap">
                    {displayText}
                  </p>
                </motion.div>
              )}
              {step === "waiting_ready" && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-col items-center gap-4"
                >
                  <p className="text-sm text-gray-500">
                    Say &ldquo;I&rsquo;m ready&rdquo; or tap below
                  </p>
                  <button
                    onClick={handleImReady}
                    className="px-6 py-2.5 text-sm font-medium text-vs-accent border border-vs-accent/50 rounded-lg hover:bg-vs-accent/10 transition-colors"
                  >
                    I&apos;m ready
                  </button>
                </motion.div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
