const KEY_BACKEND_UNAVAILABLE = "kyn_backend_unavailable";

/** localStorage key for wizard-pasted backend URL (used when VITE_API_URL is not set). */
const KEY_API_BASE_FALLBACK = "kyn_api_base_fallback";

/**
 * API base URL for backend calls. Empty = same origin (e.g. dev server or when frontend is served by Express).
 * Set VITE_API_URL in production when the frontend is on a different host (e.g. Vercel) and the backend is elsewhere (e.g. Railway).
 * If VITE_API_URL is not set, falls back to localStorage (wizard-pasted Railway URL) for progressive enhancement.
 */
export function getApiBase(): string {
  const envUrl = typeof import.meta.env.VITE_API_URL === "string" ? import.meta.env.VITE_API_URL.trim() : "";
  if (envUrl) return envUrl.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    const fallback = localStorage.getItem(KEY_API_BASE_FALLBACK);
    if (fallback && typeof fallback === "string") return fallback.replace(/\/$/, "");
  }
  return "";
}

/** Set wizard-pasted backend URL (e.g. after Railway deploy). Used when VITE_API_URL is not set. */
export function setApiBaseFallback(url: string): void {
  if (typeof window === "undefined") return;
  const v = url.trim().replace(/\/$/, "");
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
