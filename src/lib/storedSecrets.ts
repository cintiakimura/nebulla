/**
 * User-supplied API keys stored in localStorage. When set, they are sent to the backend as
 * headers (x-grok-api-key, x-builder-private-key) so routes match server .env behavior.
 * Supabase service role stays server-only; publishable key still comes from /api/config.
 */

const PREFIX = "kyn_secret_";

/** Keys shown in Settings → Secrets. Server alignment: POST /api/config/secrets-alignment */
export const SECRET_KEYS = [
  "XAI_API_KEY",
  "GROK_API_KEY",
  "BUILDER_PRIVATE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_PUBLIC_KEY",
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

/** Headers for Grok / Builder when user saved keys in Settings (sent with API calls). */
export function getBackendSecretHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  const grok = getStoredSecret("XAI_API_KEY") || getStoredSecret("GROK_API_KEY");
  if (grok) h["x-grok-api-key"] = grok;
  const builder = getStoredSecret("BUILDER_PRIVATE_KEY");
  if (builder) h["x-builder-private-key"] = builder;
  return h;
}

/** @deprecated Use getBackendSecretHeaders — same x-grok-api-key slice for Grok-only calls. */
export function getGrokRequestHeaders(): Record<string, string> {
  const b = getBackendSecretHeaders();
  return b["x-grok-api-key"] ? { "x-grok-api-key": b["x-grok-api-key"] } : {};
}
