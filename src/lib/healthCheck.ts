/**
 * Load-time health check: ping /api/health and optionally validate Supabase anon key.
 * Used by banner and wizard for live validation.
 */

export type HealthResult = {
  apiOk: boolean;
  apiStatus?: string;
  supabaseConnected?: boolean;
  version?: string;
  error?: string;
};

export type SupabaseTestResult = {
  ok: boolean;
  error?: string;
};

/**
 * Ping backend /api/health. Uses getApiBase() so respects VITE_API_URL or localStorage fallback.
 */
export async function runHealthCheck(getApiBaseUrl: () => string): Promise<HealthResult> {
  const base = getApiBaseUrl();
  const url = base ? `${base}/api/health` : "/api/health";
  try {
    const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(8000) });
    const data = await res.json().catch(() => ({})) as { status?: string; supabaseConnected?: boolean; version?: string };
    return {
      apiOk: res.ok,
      apiStatus: data.status ?? (res.ok ? "ok" : "error"),
      supabaseConnected: data.supabaseConnected,
      version: data.version,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (e) {
    return {
      apiOk: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Test Supabase connection with given URL + anon key (e.g. from wizard form) via getSession().
 */
export async function testSupabaseConnection(url: string, anonKey: string): Promise<SupabaseTestResult> {
  if (!url?.trim() || !anonKey?.trim()) {
    return { ok: false, error: "URL and anon key required" };
  }
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(url.trim(), anonKey.trim());
    const { error } = await supabase.auth.getSession();
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
