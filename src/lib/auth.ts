import { getApiBase, setBackendUnavailable, clearBackendUnavailable } from "./api";

/**
 * Client-side auth: get or create userId and persist for API calls.
 * Open mode (no login, no pay walls): when VITE_OPEN_MODE is set OR host is cintiakimura.eu.
 */
const KEY_USER_ID = "kyn_user_id";
const KEY_OPEN_MODE_USER_ID = "kyn_open_mode_user_id";

const DASHBOARD_DOMAIN = "cintiakimura.eu";

/** True when app should run in open mode: localhost (personal dev), cintiakimura.eu, or VITE_OPEN_MODE. */
export function isOpenMode(): boolean {
  if (import.meta.env.VITE_OPEN_MODE) return true;
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === DASHBOARD_DOMAIN || h === `www.${DASHBOARD_DOMAIN}`;
}

async function getOpenModeFallbackUserId(): Promise<string | null> {
  const apiBase = getApiBase();
  if (!apiBase) return null;
  try {
    const res = await fetch(`${apiBase}/api/config`);
    if (!res.ok) return null;
    const data = (await res.json()) as { openModeFallbackUserId?: string | null };
    const id = data.openModeFallbackUserId?.trim();
    return id || null;
  } catch {
    return null;
  }
}

export async function getUserId(): Promise<string> {
  if (typeof window === "undefined") return "";
  if (isOpenMode()) {
    let fallback = localStorage.getItem(KEY_OPEN_MODE_USER_ID);
    if (fallback) return fallback;
    fallback = await getOpenModeFallbackUserId();
    if (fallback) {
      localStorage.setItem(KEY_OPEN_MODE_USER_ID, fallback);
      return fallback;
    }
    return "open-dev-user";
  }
  let userId = localStorage.getItem(KEY_USER_ID);
  if (userId) return userId;
  const apiBase = getApiBase();
  try {
    const res = await fetch(`${apiBase || ""}/api/auth/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      clearBackendUnavailable();
      const data = (await res.json()) as { userId?: string };
      userId = data?.userId ?? crypto.randomUUID();
    } else {
      setBackendUnavailable();
      userId = crypto.randomUUID();
    }
  } catch {
    setBackendUnavailable();
    userId = crypto.randomUUID();
  }
  localStorage.setItem(KEY_USER_ID, userId);
  return userId;
}

export function setUserIdAfterLogin(userId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_USER_ID, userId);
}

export function clearUserId(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY_USER_ID);
}

const KEY_PAID = "kyn_paid";
const KEY_PLAN = "kyn_plan";

export function getPaidStatus(): { paid: boolean; plan?: string } {
  if (typeof window === "undefined") return { paid: false };
  if (isOpenMode()) return { paid: true, plan: "pro" };
  const paid = localStorage.getItem(KEY_PAID) === "true";
  const plan = localStorage.getItem(KEY_PLAN) ?? undefined;
  return { paid, plan: plan || undefined };
}

export function setPaidFromSuccess(plan: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_PAID, "true");
  localStorage.setItem(KEY_PLAN, plan);
}
