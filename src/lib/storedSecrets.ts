/**
 * User-supplied API keys stored in localStorage (override .env when set).
 * Grok/XAI key is backend-only (XAI_API_KEY in env); never stored or sent from frontend.
 */

const PREFIX = "kyn_secret_";

/** Keys shown in Settings → API keys & secrets. Supabase/Vercel are backend-only (profile already set). */
export const SECRET_KEYS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_PUBLIC_KEY",
  "BUILDER_PRIVATE_KEY",
] as const;

export type SecretKey = (typeof SECRET_KEYS)[number];

function storageKey(key: string): string {
  return PREFIX + key;
}

export function getStoredSecret(key: string): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(storageKey(key)) ?? "";
  } catch {
    return "";
  }
}

export function setStoredSecret(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    const k = storageKey(key);
    if (value.trim()) localStorage.setItem(k, value.trim());
    else localStorage.removeItem(k);
  } catch (_) {}
}

export function hasStoredSecret(key: string): boolean {
  const v = getStoredSecret(key);
  return v.length > 0 && v !== "PLACEHOLDER";
}

/** No client-side Grok key. Backend uses XAI_API_KEY from env only. Kept for API compatibility; returns {}. */
export function getGrokRequestHeaders(): Record<string, string> {
  return {};
}
