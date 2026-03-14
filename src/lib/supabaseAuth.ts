/**
 * Supabase client for auth (OAuth). Uses VITE_SUPABASE_* when set; else wizard-saved creds; else fetches from backend /api/config (hosted kyn.app).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseCreds } from "./setupStorage";
import { getApiBase } from "./api";

let client: SupabaseClient | null = null;
let clientCacheKey: string = "";

let cachedConfig: { url: string; anonKey: string } | null = null;

function getCacheKey(url: string, key: string): string {
  return url + "|" + key.slice(0, 20);
}

/** Fetch Supabase url + anon key from backend (no env vars needed on frontend). */
export async function fetchSupabaseConfig(): Promise<{ url: string; anonKey: string } | null> {
  if (typeof window === "undefined") return null;
  const base = getApiBase() || window.location.origin;
  try {
    const res = await fetch(`${base}/api/config`);
    if (!res.ok) return null;
    const data = (await res.json()) as { supabaseUrl?: string; supabaseAnonKey?: string };
    const url = data.supabaseUrl?.trim();
    const anonKey = data.supabaseAnonKey?.trim();
    if (url && anonKey) return { url, anonKey };
  } catch (_) {}
  return null;
}

/** Call once at app load so getSupabaseAuthClient() can use backend config when env/wizard are missing. */
export async function ensureSupabaseConfig(): Promise<void> {
  if (cachedConfig) return;
  const config = await fetchSupabaseConfig();
  if (config) {
    cachedConfig = config;
    client = null;
    clientCacheKey = "";
  }
}

/** Clear cached Supabase config and client so next getSupabaseAuthClient() will refetch (e.g. after API URL change). */
export function clearSupabaseConfigCache(): void {
  cachedConfig = null;
  client = null;
  clientCacheKey = "";
}

export function getSupabaseAuthClient(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  let url = import.meta.env.VITE_SUPABASE_URL;
  let key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (typeof url !== "string" || !url.trim() || typeof key !== "string" || !key.trim()) {
    const creds = getSupabaseCreds();
    if (creds?.url?.trim() && creds?.anonKey?.trim()) {
      url = creds.url.trim();
      key = creds.anonKey.trim();
    } else if (cachedConfig?.url && cachedConfig?.anonKey) {
      url = cachedConfig.url;
      key = cachedConfig.anonKey;
    } else {
      return null;
    }
  }
  const keyId = getCacheKey(url, key);
  if (client && clientCacheKey === keyId) return client;
  clientCacheKey = keyId;
  client = createClient(url, key);
  return client;
}

export function isSupabaseAuthConfigured(): boolean {
  return getSupabaseAuthClient() !== null;
}

/** Get current session access_token for API calls (e.g. /api/users/me/limits, /api/export/:id). */
export async function getSessionToken(): Promise<string | null> {
  const supabase = getSupabaseAuthClient();
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

const KEY_FIRST_LOGIN = "kyn_first_login_done";

export async function isFirstLogin(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    if (localStorage.getItem(KEY_FIRST_LOGIN) === "true") return false;
    const supabase = getSupabaseAuthClient();
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.user_metadata?.first_login === false) return false;
    }
    return true;
  } catch {
    return true; // on error, show onboarding (fail open)
  }
}

export function setFirstLoginDone(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_FIRST_LOGIN, "true");
  const supabase = getSupabaseAuthClient();
  if (supabase) {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) supabase.auth.updateUser({ data: { ...user?.user_metadata, first_login: false } });
    });
  }
}
