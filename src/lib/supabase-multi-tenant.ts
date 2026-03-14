/**
 * Server-side multi-tenant Supabase access.
 * Uses service_role to bypass RLS; all calls are scoped by user_id.
 * Use for: projects, user metadata (is_pro, grok_calls_today), mind_maps, chats.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;

function getAdminClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key || url === "PLACEHOLDER" || key === "PLACEHOLDER") return null;
  if (!adminClient) {
    adminClient = createClient(url, key, { auth: { persistSession: false } });
  }
  return adminClient;
}

export function isSupabaseConfigured(): boolean {
  return getAdminClient() !== null;
}

export type ProjectRow = {
  id: string;
  user_id: string;
  name: string;
  status: string;
  last_edited: string;
  code: string;
  package_json: string;
  chat_messages: string;
  specs: string;
  plan: string | null;
  created_at: string;
};

export type UserMetadataRow = {
  id: string;
  is_pro: boolean;
  plan: string | null;
  paid: boolean;
  paid_until: string | null;
  grok_calls_today: number;
  grok_calls_date: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

export async function listProjects(userId: string): Promise<Omit<ProjectRow, "code" | "package_json" | "chat_messages" | "specs">[]> {
  const supabase = getAdminClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("projects")
    .select("id, user_id, name, status, last_edited, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[supabase-multi-tenant] listProjects", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    user_id: r.user_id,
    name: r.name,
    status: r.status,
    last_edited: r.last_edited ?? "",
    created_at: r.created_at,
  }));
}

export async function countProjects(userId: string): Promise<number> {
  const supabase = getAdminClient();
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) {
    console.error("[supabase-multi-tenant] countProjects", error.message);
    return 0;
  }
  return count ?? 0;
}

export async function getProject(userId: string, projectId: string): Promise<ProjectRow | null> {
  const supabase = getAdminClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[supabase-multi-tenant] getProject", error.message);
    return null;
  }
  if (!data) return null;
  return {
    id: data.id,
    user_id: data.user_id,
    name: data.name ?? "Untitled",
    status: data.status ?? "Draft",
    last_edited: data.last_edited ?? "",
    code: data.code ?? "",
    package_json: data.package_json ?? "{}",
    chat_messages: data.chat_messages ?? "[]",
    specs: data.specs ?? "{}",
    plan: data.plan ?? null,
    created_at: data.created_at,
  };
}

const defaultCode = `export default function App() {
  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h1>Hello from kyn Builder</h1>
      <p>Start editing to see some magic happen!</p>
    </div>
  );
}`;

const defaultPackageJson = JSON.stringify({ name: "kyn-app", private: true, version: "0.0.0" }, null, 2);

export async function createProject(userId: string, name: string): Promise<ProjectRow | null> {
  const supabase = getAdminClient();
  if (!supabase) return null;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: userId,
      name: name || "Untitled",
      status: "Draft",
      last_edited: now,
      code: defaultCode,
      package_json: defaultPackageJson,
      chat_messages: "[]",
      specs: "{}",
    })
    .select()
    .single();
  if (error) {
    console.error("[supabase-multi-tenant] createProject", error.message);
    return null;
  }
  return data as ProjectRow;
}

export async function updateProject(
  userId: string,
  projectId: string,
  updates: {
    name?: string;
    status?: string;
    last_edited?: string;
    code?: string;
    package_json?: string;
    chat_messages?: string;
    specs?: string;
    plan?: Record<string, unknown> | string;
    code_versions?: unknown[] | string;
    deployment_status?: string;
    live_url?: string | null;
  }
): Promise<boolean> {
  const supabase = getAdminClient();
  if (!supabase) return false;
  const planVal = updates.plan === undefined ? undefined : typeof updates.plan === "string" ? updates.plan : JSON.stringify(updates.plan);
  const codeVersionsVal = updates.code_versions === undefined ? undefined : typeof updates.code_versions === "string" ? updates.code_versions : JSON.stringify(updates.code_versions ?? []);
  const { error } = await supabase
    .from("projects")
    .update({
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.status !== undefined && { status: updates.status }),
      ...(updates.last_edited !== undefined && { last_edited: updates.last_edited }),
      ...(updates.code !== undefined && { code: updates.code }),
      ...(updates.package_json !== undefined && { package_json: updates.package_json }),
      ...(updates.chat_messages !== undefined && { chat_messages: updates.chat_messages }),
      ...(updates.specs !== undefined && { specs: updates.specs }),
      ...(planVal !== undefined && { plan: planVal }),
      ...(codeVersionsVal !== undefined && { code_versions: codeVersionsVal }),
      ...(updates.deployment_status !== undefined && { deployment_status: updates.deployment_status }),
      ...(updates.live_url !== undefined && { live_url: updates.live_url }),
    })
    .eq("id", projectId)
    .eq("user_id", userId);
  if (error) {
    console.error("[supabase-multi-tenant] updateProject", error.message);
    return false;
  }
  return true;
}

export async function getUserMetadata(userId: string): Promise<UserMetadataRow | null> {
  const supabase = getAdminClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("[supabase-multi-tenant] getUserMetadata", error.message);
    return null;
  }
  if (!data) return null;
  return {
    id: data.id,
    is_pro: data.is_pro === true,
    plan: data.plan ?? null,
    paid: data.paid === true,
    paid_until: data.paid_until ?? null,
    grok_calls_today: Number(data.grok_calls_today) || 0,
    grok_calls_date: data.grok_calls_date ?? null,
    stripe_customer_id: data.stripe_customer_id ?? null,
    stripe_subscription_id: data.stripe_subscription_id ?? null,
  };
}

/** Ensure users row exists; then return metadata. */
export async function ensureUserAndGetMetadata(userId: string): Promise<UserMetadataRow | null> {
  const supabase = getAdminClient();
  if (!supabase) return null;
  const { data: existing } = await supabase.from("users").select("id").eq("id", userId).maybeSingle();
  if (!existing) {
    const { error } = await supabase.from("users").insert({ id: userId });
    if (error) {
      console.error("[supabase-multi-tenant] ensureUser", error.message);
      return null;
    }
  }
  return getUserMetadata(userId);
}

/** Increment grok_calls_today for user; reset if date changed. Returns new count. */
export async function incrementGrokCalls(userId: string): Promise<{ count: number; limit: number }> {
  const meta = await ensureUserAndGetMetadata(userId);
  const today = new Date().toISOString().slice(0, 10);
  const supabase = getAdminClient();
  if (!supabase) return { count: 0, limit: 10 };

  const prevDate = meta?.grok_calls_date ?? null;
  const prevCount = meta?.grok_calls_today ?? 0;
  const isNewDay = prevDate !== today;

  const newCount = isNewDay ? 1 : prevCount + 1;
  const { error } = await supabase
    .from("users")
    .update({
      grok_calls_today: newCount,
      grok_calls_date: today,
    })
    .eq("id", userId);
  if (error) {
    console.error("[supabase-multi-tenant] incrementGrokCalls", error.message);
    return { count: prevCount, limit: 10 };
  }
  const freeLimit = Math.max(0, parseInt(process.env.FREE_GROK_DAILY_LIMIT ?? "10", 10));
  return { count: newCount, limit: freeLimit };
}

/** Get current grok usage for the day (without incrementing). */
export async function getGrokUsage(userId: string): Promise<{ count: number; date: string | null }> {
  const meta = await getUserMetadata(userId);
  const today = new Date().toISOString().slice(0, 10);
  if (!meta || meta.grok_calls_date !== today) return { count: 0, date: today };
  return { count: meta.grok_calls_today, date: meta.grok_calls_date };
}

/** Set is_pro (and paid) for a user (Stripe webhook). No paid_until — flat access by is_pro. */
export async function setUserPro(
  userId: string,
  isPro: boolean,
  stripeCustomerId?: string | null,
  stripeSubscriptionId?: string | null,
  plan?: string | null
): Promise<boolean> {
  const supabase = getAdminClient();
  if (!supabase) return false;
  const payload: Record<string, unknown> = {
    id: userId,
    is_pro: isPro,
    paid: isPro,
    plan: isPro ? (plan ?? "pro") : null,
    updated_at: new Date().toISOString(),
    paid_until: null,
  };
  if (stripeCustomerId != null) payload.stripe_customer_id = stripeCustomerId;
  if (stripeSubscriptionId != null) payload.stripe_subscription_id = stripeSubscriptionId;
  const { error } = await supabase
    .from("users")
    .upsert(payload, { onConflict: "id" });
  if (error) {
    console.error("[supabase-multi-tenant] setUserPro", error.message);
    return false;
  }
  return true;
}
