/**
 * Supabase client for auth (OAuth). Only created when VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabaseAuthClient(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (typeof url !== "string" || !url.trim() || typeof key !== "string" || !key.trim()) return null;
  if (!client) client = createClient(url.trim(), key.trim());
  return client;
}

export function isSupabaseAuthConfigured(): boolean {
  return getSupabaseAuthClient() !== null;
}

const KEY_FIRST_LOGIN = "kyn_first_login_done";

export async function isFirstLogin(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (localStorage.getItem(KEY_FIRST_LOGIN) === "true") return false;
  const supabase = getSupabaseAuthClient();
  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.user_metadata?.first_login === false) return false;
  }
  return true;
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
