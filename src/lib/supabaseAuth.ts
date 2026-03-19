/**
 * Supabase client for auth (OAuth).
 * Uses wizard-saved creds first; otherwise fetches Supabase config from backend /api/config.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseCreds } from "./setupStorage";
import { getApiBase } from "./api";

let client: SupabaseClient | null = null;
let clientCacheKey: string = "";

let cachedConfig: { url: string; publishableKey: string } | null = null;

function getCacheKey(url: string, key: string): string {
  return url + "|" + key.slice(0, 20);
}

/** Fetch Supabase url + publishable key from backend (no env vars needed on frontend). */
export async function fetchSupabaseConfig(): Promise<{ url: string; anonKey: string } | null> {
  if (typeof window === "undefined") return null;
  const base = getApiBase() || window.location.origin;
  const configUrl = base.endsWith("/api") ? `${base}/config` : `${base}/api/config`;
  try {
    const res = await fetch(configUrl);
    if (!res.ok) return null;
    const data = (await res.json()) as { supabaseUrl?: string; supabasePublishableKey?: string; supabaseAnonKey?: string };
    const url = data.supabaseUrl?.trim();
    const publishableKey = data.supabasePublishableKey?.trim() || data.supabaseAnonKey?.trim();
    if (url && publishableKey) return { url, anonKey: publishableKey };
  } catch (_) {}
  return null;
}

/** Call once at app load so getSupabaseAuthClient() can use backend config when env/wizard are missing. */
export async function ensureSupabaseConfig(): Promise<void> {
  if (cachedConfig) return;
  const config = await fetchSupabaseConfig();
  if (config) {
    cachedConfig = { url: config.url, publishableKey: config.anonKey };
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
  const creds = getSupabaseCreds();
  const url = creds?.url?.trim() || cachedConfig?.url;
  const key = creds?.anonKey?.trim() || cachedConfig?.publishableKey;
  if (typeof url !== "string" || !url.trim() || typeof key !== "string" || !key.trim()) return null;
  const keyId = getCacheKey(url, key);
  if (client && clientCacheKey === keyId) return client;
  clientCacheKey = keyId;
  client = createClient(url, key, {
    auth: {
      flowType: "pkce",
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
    },
  });
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
