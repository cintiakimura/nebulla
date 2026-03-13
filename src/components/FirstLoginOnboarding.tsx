import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mic } from "lucide-react";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import { getApiBase } from "../lib/api";

const INTRO_SCRIPT =
  "Hey—I'm Kyn, your dev partner. Most people give vague prompts, jump straight to code, and end up with Frankenstein bugs and frustration. We're different. We work smarter—architecture first, strategic, no rush. I'm here to brainstorm with you, suggest better ideas, challenge you—you challenge me—until we've got an airtight plan. Everything we need. Before one line of code.";
const PROMPT_READY =
  "If you're ready—just say \"I'm ready\".";
const OUTRO_SCRIPT = "Let's go. What's your idea?";

/** Play text using Grok voice (Eve) via backend TTS. No browser TTS. If no backend is configured, skips playback and calls onEnd (avoids 405 on frontend host). */
function playGrokEve(text: string, onEnd?: () => void): () => void {
  if (typeof window === "undefined") {
    onEnd?.();
    return () => {};
  }
  const apiBase = getApiBase();
  if (!apiBase) {
    onEnd?.();
    return () => {};
  }
  const url = `${apiBase}/api/tts`;
  const audio = new Audio();
  let cancelled = false;

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice_id: "eve" }),
  })
    .then((res) => {
      if (cancelled || !res.ok) {
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
  const [step, setStep] = useState<Step>("idle");
  const [displayText, setDisplayText] = useState<string>("");
  const cancelPlayRef = useRef<(() => void) | null>(null);
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
      });
    });
  };

  const handleImReady = () => {
    SpeechRecognition.stopListening();
    cancelPlayRef.current?.();
    setStep("done");
    setDisplayText(OUTRO_SCRIPT);
    playGrokEve(OUTRO_SCRIPT);
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
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#0a0a0f] text-gray-200 font-sans"
        style={{ pointerEvents: isDone ? "none" : "auto" }}
      >
        <div className="flex flex-col items-center justify-center gap-10 px-6 max-w-2xl text-center">
          {step === "idle" && (
            <>
              <motion.div
                animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="flex items-center justify-center w-24 h-24 rounded-full bg-[#1a1a24] border border-[#2a2a3a]"
              >
                <Mic size={48} className="text-[#6366f1]" strokeWidth={1.5} />
              </motion.div>
              <p className="text-[15px] text-gray-400 leading-relaxed max-w-md">
                Kyn will introduce herself with Grok&apos;s voice (Eve). You can read along and say &ldquo;I&rsquo;m ready&rdquo; when you are.
              </p>
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.3 }}
                onClick={handleLetsStart}
                className="px-10 py-4 text-lg font-medium text-white rounded-lg bg-[#6366f1] hover:bg-[#5558e3] shadow-[0_0_32px_rgba(99,102,241,0.4)] hover:shadow-[0_0_40px_rgba(99,102,241,0.5)] transition-all duration-200"
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
                <Mic size={40} className="text-[#6366f1]" strokeWidth={1.5} />
              </motion.div>
              {displayText && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="w-full rounded-xl bg-[#1a1a24] border border-[#2a2a3a] p-6 text-left"
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
                    className="px-6 py-2.5 text-sm font-medium text-[#6366f1] border border-[#6366f1]/50 rounded-lg hover:bg-[#6366f1]/10 transition-colors"
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
