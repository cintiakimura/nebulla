import { getApiBase, setBackendUnavailable, clearBackendUnavailable } from "./api";
import { getSupabaseAuthClient } from "./supabaseAuth";

/**
 * Client-side auth: get or create userId and persist for API calls.
 * Open mode (no login, no pay walls): when VITE_OPEN_MODE is set OR host is cintiakimura.eu.
 */
const KEY_USER_ID = "kyn_user_id";

const DASHBOARD_DOMAIN = "cintiakimura.eu";

/** True when app should run in open mode: localhost (personal dev), cintiakimura.eu, or VITE_OPEN_MODE. */
export function isOpenMode(): boolean {
  if (import.meta.env.VITE_OPEN_MODE) return true;
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === DASHBOARD_DOMAIN ||
    h === `www.${DASHBOARD_DOMAIN}` ||
    // Demo deployments on Vercel: treat kyn-*.vercel.app as open mode.
    (h.endsWith(".vercel.app") && (h.startsWith("kyn-") || h.startsWith("nebulla-")))
  );
}

export async function getUserId(): Promise<string> {
  if (typeof window === "undefined") return "";
  // If user signed in with Supabase (GitHub/Google/etc.), URL path :userId MUST match the token
  // or the API returns 403. Open-mode domains used to always return "open-dev-user" here, which
  // broke logged-in users (mismatch vs Bearer session).
  try {
    const supabase = getSupabaseAuthClient();
    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (uid) return uid;
    }
  } catch (_) {
    /* ignore */
  }
  // Open mode, no Supabase session: anonymous builder (Vercel open-dev-user + serverless paths).
  if (isOpenMode()) return "open-dev-user";
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
