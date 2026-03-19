import React from "react";
import { X } from "lucide-react";
import { Link } from "react-router-dom";

export function logFreeTierAttempt(action: string) {
  if (typeof console !== "undefined" && console.warn) {
    console.warn("[kyn] Free tier: attempt blocked", { action });
  }
}

type Props = {
  open: boolean;
  onClose: () => void;
  action?: string;
  /** Custom title (default: "Upgrade to Pro") */
  title?: string;
  /** Custom message (default: Pro — unlimited projects, Grok, export, GitHub, custom domains.) */
  message?: string;
  /** Optional CTA label (default: "OK"). Use "Upgrade to Pro" to show link to /pricing */
  ctaLabel?: string;
  ctaToPricing?: boolean;
};

export default function UpgradeProModal({
  open,
  onClose,
  action,
  title = "Upgrade to Pro",
  message = "Pro — unlimited projects, Grok chats, export, GitHub, custom domains.",
  ctaLabel = "OK",
  ctaToPricing = false,
}: Props) {
  if (!open) return null;
  if (action) logFreeTierAttempt(action);

  return (
    <div
      className="fixed inset-0 bg-background/80 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-sidebar-bg border border-border rounded-lg p-4 w-72 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm font-medium text-white">{title}</span>
          <button
            onClick={onClose}
            className="p-1 rounded text-muted hover:text-white hover:bg-border/40"
          >
            <X size={16} />
          </button>
        </div>
        <p className="text-sm text-muted mb-3">
          {message}
        </p>
        {ctaToPricing ? (
          <Link
            to="/pricing"
            onClick={onClose}
            className="block w-full py-2 px-3 bg-primary hover:bg-primary/90 text-white text-sm rounded-lg transition-colors text-center"
          >
            {ctaLabel}
          </Link>
        ) : (
          <button
            onClick={onClose}
            className="w-full py-2 px-3 bg-primary hover:bg-primary/90 text-white text-sm rounded-lg transition-colors"
          >
            {ctaLabel}
          </button>
        )}
      </div>
    </div>
  );
}
