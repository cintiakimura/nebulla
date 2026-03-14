/**
 * User-supplied API keys stored in localStorage (override .env when set).
 * Keys are prefixed so we can list and send only when needed.
 */

const PREFIX = "kyn_secret_";

export const SECRET_KEYS = [
  "GROK_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
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

/** Headers to send with Grok-related API requests (chat, TTS, realtime token). */
export function getGrokRequestHeaders(): Record<string, string> {
  const key = getStoredSecret("GROK_API_KEY");
  if (!key || key === "PLACEHOLDER") return {};
  return { "X-Grok-Api-Key": key };
}
