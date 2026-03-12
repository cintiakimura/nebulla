const KEY_BACKEND_UNAVAILABLE = "kyn_backend_unavailable";

/** localStorage key for wizard-pasted backend URL (used when VITE_API_URL is not set). */
const KEY_API_BASE_FALLBACK = "kyn_api_base_fallback";

/**
 * API base URL for backend calls. Empty = same origin (e.g. dev server or when frontend is served by Express).
 * Set VITE_API_URL in production when the frontend is on another host (e.g. Vercel). Use the backend origin:
 * - With protocol: https://your-backend.example.com (no trailing slash).
 * - Without protocol (e.g. cintiakimura.eu): we prepend https:// so fetch() uses an absolute URL, not a relative path.
 * If the value ends with /api we strip it so requests don't double to /api/api/...
 */
function ensureAbsoluteUrl(url: string): string {
  const t = url.trim();
  if (!t) return t;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

export function getApiBase(): string {
  let envUrl = typeof import.meta.env.VITE_API_URL === "string" ? import.meta.env.VITE_API_URL.trim() : "";
  if (envUrl) {
    envUrl = envUrl.replace(/\/$/, "").replace(/\/api$/i, "");
    return ensureAbsoluteUrl(envUrl);
  }
  if (typeof window !== "undefined") {
    const fallback = localStorage.getItem(KEY_API_BASE_FALLBACK);
    if (fallback && typeof fallback === "string") {
      const v = fallback.replace(/\/$/, "").replace(/\/api$/i, "");
      return ensureAbsoluteUrl(v);
    }
  }
  return "";
}

/** Set wizard-pasted backend URL. Used when VITE_API_URL is not set. Trims and strips trailing /api. */
export function setApiBaseFallback(url: string): void {
  if (typeof window === "undefined") return;
  const v = url.trim().replace(/\/$/, "").replace(/\/api$/i, "");
  if (v) localStorage.setItem(KEY_API_BASE_FALLBACK, v);
  else localStorage.removeItem(KEY_API_BASE_FALLBACK);
  window.dispatchEvent(new CustomEvent("kyn-api-base-changed"));
}

/**
 * True when we should try to call the backend.
 * - Same origin (empty VITE_API_URL): always try, so the app works when served by Express (npm run dev or full-stack deploy).
 * - Different origin (VITE_API_URL set): try that URL.
 */
export function isBackendConfigured(): boolean {
  return true;
}

/** Mark backend as unavailable after a failed request. Cleared when a request succeeds. */
export function setBackendUnavailable(): void {
  if (typeof window !== "undefined") sessionStorage.setItem(KEY_BACKEND_UNAVAILABLE, "1");
}

/** Clear the "backend unavailable" flag so the app will try the API again. Call after a successful request. */
export function clearBackendUnavailable(): void {
  if (typeof window !== "undefined") sessionStorage.removeItem(KEY_BACKEND_UNAVAILABLE);
}

/** True when we haven't seen a recent API failure. After a 404/failure we set the flag; successful requests clear it. */
export function isBackendAvailable(): boolean {
  if (typeof window === "undefined") return true;
  return sessionStorage.getItem(KEY_BACKEND_UNAVAILABLE) !== "1";
}
