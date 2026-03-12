import { motion, AnimatePresence } from "motion/react";
import { MessageCircle } from "lucide-react";
import { useHelpWidgetOptional } from "../context/HelpWidgetContext";
import { clsx } from "clsx";

/**
 * Floating bubble in bottom-right. Toggles help panel.
 * Non-intrusive: small when closed, aria-label for a11y.
 */
export default function HelpWidgetBubble() {
  const ctx = useHelpWidgetOptional();
  if (!ctx) return null;
  const { open, setOpen, hiddenForever } = ctx;
  if (hiddenForever) return null;

  return (
    <AnimatePresence>
      <motion.button
        type="button"
        aria-label={open ? "Close help" : "Open setup guide and help"}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={clsx(
          "fixed bottom-6 right-6 z-[9998] flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-colors",
          "bg-[#007acc] hover:bg-[#1a8ad4] text-white",
          "focus:outline-none focus:ring-2 focus:ring-[#007acc] focus:ring-offset-2 focus:ring-offset-[#1e1e1e]"
        )}
        initial={false}
        animate={{
          scale: 1,
          opacity: 1,
        }}
        exit={{ scale: 0, opacity: 0 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.98 }}
      >
        <MessageCircle size={24} strokeWidth={2} />
      </motion.button>
    </AnimatePresence>
  );
}
