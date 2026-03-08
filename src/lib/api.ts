const KEY_BACKEND_UNAVAILABLE = "kyn_backend_unavailable";

/**
 * API base URL for backend calls. Empty = same origin (e.g. dev server or when frontend is served by Express).
 * Set VITE_API_URL in production when the frontend is on a different host (e.g. Vercel) and the backend is elsewhere (e.g. Railway).
 */
export function getApiBase(): string {
  const url = typeof import.meta.env.VITE_API_URL === "string" ? import.meta.env.VITE_API_URL.trim() : "";
  return url ? url.replace(/\/$/, "") : "";
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
