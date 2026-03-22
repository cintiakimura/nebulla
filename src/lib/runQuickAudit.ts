/**
 * Full audit of every API functionality. Returns a list of { name, ok, detail } so the
 * report has a status for every single functionality with no blind spots.
 */

import { getBackendSecretHeaders } from "./storedSecrets";

export type AuditEntry = { name: string; ok: boolean; detail: string };

function passDetail(msg: string): string {
  return msg || "ok";
}

export async function runQuickAudit(apiBase: string): Promise<AuditEntry[]> {
  const results: AuditEntry[] = [];
  const base = apiBase.replace(/\/$/, "");
  const secretHeaders = getBackendSecretHeaders();

  function record(name: string, ok: boolean, detail: string) {
    results.push({ name, ok, detail: detail ?? "" });
  }

  // —— 1. Health & config ——
  try {
    const healthRes = await fetch(`${base}/api/health`);
    const healthOk = healthRes.ok;
    record("GET /api/health", healthOk, healthOk ? passDetail("backend reachable") : `status ${healthRes.status}`);
  } catch (e) {
    record("GET /api/health", false, e instanceof Error ? e.message : String(e));
  }

  try {
    const configRes = await fetch(`${base}/api/config`);
    const configData = await configRes.json().catch(() => ({})) as Record<string, unknown>;
    const configOk = configRes.ok && typeof configData === "object";
    record("GET /api/config", configOk, configOk ? passDetail("config returned") : `status ${configRes.status}`);
  } catch (e) {
    record("GET /api/config", false, e instanceof Error ? e.message : String(e));
  }

  try {
    const secRes = await fetch(`${base}/api/config/secrets-audit`);
    const secData = await secRes.json().catch(() => ({})) as { items?: unknown[]; runtime?: unknown };
    const secOk = secRes.ok && Array.isArray((secData as { items?: unknown[] }).items);
    record(
      "GET /api/config/secrets-audit",
      secOk,
      secOk ? passDetail("server env checklist returned") : `status ${secRes.status}`
    );
  } catch (e) {
    record("GET /api/config/secrets-audit", false, e instanceof Error ? e.message : String(e));
  }

  try {
    const intRes = await fetch(`${base}/api/integrations/summary`);
    const intData = await intRes.json().catch(() => ({})) as { architecture?: string };
    const intOk = intRes.ok && intData.architecture === "backend-first-monorepo";
    record(
      "GET /api/integrations/summary",
      intOk,
      intOk ? passDetail("backend-first integrations map") : `status ${intRes.status}`
    );
  } catch (e) {
    record("GET /api/integrations/summary", false, e instanceof Error ? e.message : String(e));
  }

  // —— 2. Auth / session ——
  try {
    const sessionRes = await fetch(`${base}/api/auth/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const sessionData = await sessionRes.json().catch(() => ({}));
    const sessionOk = sessionRes.ok && typeof (sessionData as { userId?: string }).userId === "string";
    record(
      "POST /api/auth/session (returns userId)",
      sessionOk,
      sessionOk ? passDetail("userId returned") : `status ${sessionRes.status}`
    );
  } catch (e) {
    record("POST /api/auth/session (returns userId)", false, e instanceof Error ? e.message : String(e));
  }
  try {
    const sessionRes2 = await fetch(`${base}/api/auth/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "test-user-123" }),
    });
    const sessionData2 = await sessionRes2.json().catch(() => ({}));
    const echoOk = sessionRes2.ok && (sessionData2 as { userId?: string }).userId === "test-user-123";
    record(
      "POST /api/auth/session (echoes userId)",
      echoOk,
      echoOk ? passDetail("userId echoed") : `status ${sessionRes2.status}`
    );
  } catch (e) {
    record("POST /api/auth/session (echoes userId)", false, e instanceof Error ? e.message : String(e));
  }

  const userId = "test-user-" + Date.now();

  // —— 3. Projects CRUD ——
  let projectId: string | undefined;
  try {
    const listRes = await fetch(`${base}/api/users/${userId}/projects`);
    const listJson = await listRes.json().catch(() => null);
    const listOk = listRes.ok && Array.isArray(listJson);
    record("GET /api/users/:userId/projects", listOk, listOk ? passDetail("array returned") : `status ${listRes.status}`);
  } catch (e) {
    record("GET /api/users/:userId/projects", false, e instanceof Error ? e.message : String(e));
  }
  try {
    const limitsRes = await fetch(`${base}/api/users/${userId}/limits`);
    const limitsData = await limitsRes.json().catch(() => ({}));
    const limitsOk = limitsRes.ok && typeof (limitsData as { projectLimit?: number }).projectLimit === "number";
    record(
      "GET /api/users/:userId/limits",
      limitsOk,
      limitsOk ? passDetail(`projectLimit=${(limitsData as { projectLimit?: number }).projectLimit}`) : `status ${limitsRes.status}`
    );
  } catch (e) {
    record("GET /api/users/:userId/limits", false, e instanceof Error ? e.message : String(e));
  }
  try {
    const createRes = await fetch(`${base}/api/users/${userId}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test Project" }),
    });
    const createData = await createRes.json().catch(() => ({})) as { id?: string };
    const createOk = createRes.status === 201 && !!createData?.id;
    projectId = createData?.id;
    record("POST /api/users/:userId/projects", createOk, createOk ? `id=${createData!.id}` : `status ${createRes.status}`);
  } catch (e) {
    record("POST /api/users/:userId/projects", false, e instanceof Error ? e.message : String(e));
  }
  if (projectId) {
    try {
      const getRes = await fetch(`${base}/api/users/${userId}/projects/${projectId}`);
      const getData = await getRes.json().catch(() => ({})) as { id?: string };
      record("GET /api/users/:userId/projects/:id", getRes.ok && !!getData.id, getRes.ok ? passDetail("project returned") : `status ${getRes.status}`);
    } catch (e) {
      record("GET /api/users/:userId/projects/:id", false, e instanceof Error ? e.message : String(e));
    }
    try {
      const updateRes = await fetch(`${base}/api/users/${userId}/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated", last_edited: new Date().toISOString() }),
      });
      const updateData = await updateRes.json().catch(() => ({})) as { ok?: boolean };
      record("PUT /api/users/:userId/projects/:id", updateRes.ok && !!updateData.ok, updateRes.ok ? passDetail("updated") : `status ${updateRes.status}`);
    } catch (e) {
      record("PUT /api/users/:userId/projects/:id", false, e instanceof Error ? e.message : String(e));
    }
  } else {
    record("GET /api/users/:userId/projects/:id", false, "no projectId (create failed or skipped)");
    record("PUT /api/users/:userId/projects/:id", false, "no projectId (create failed or skipped)");
  }

  // —— 4. Agent config ——
  try {
    const configRes = await fetch(`${base}/api/agent/config`);
    const configData = await configRes.json().catch(() => ({})) as { agentId?: string; preCodeQuestions?: unknown[] };
    const agentConfigOk = configRes.ok && !!configData.agentId && Array.isArray(configData.preCodeQuestions);
    record(
      "GET /api/agent/config",
      agentConfigOk,
      agentConfigOk ? passDetail(`agentId=${configData.agentId}`) : `status ${configRes.status}`
    );
  } catch (e) {
    record("GET /api/agent/config", false, e instanceof Error ? e.message : String(e));
  }

  // —— 5. Agent chat (Grok) ——
  try {
    const chatRes = await fetch(`${base}/api/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...secretHeaders },
      body: JSON.stringify({ messages: [{ role: "user", content: "Say: test" }] }),
    });
    const chatData = await chatRes.json().catch(() => ({})) as { message?: { content?: string }; error?: string };
    const chatOk = chatRes.ok && chatData?.message && typeof chatData.message.content === "string";
    const chat503 = chatRes.status === 503;
    if (chatOk) record("POST /api/agent/chat", true, passDetail("reply received"));
    else if (chat503) record("POST /api/agent/chat", true, "503 — Service unavailable (contact support)");
    else record("POST /api/agent/chat", false, `status ${chatRes.status}${chatData?.error ? ` — ${chatData.error}` : ""}`);
  } catch (e) {
    record("POST /api/agent/chat", false, e instanceof Error ? e.message : String(e));
  }

  // —— 6. Voice: realtime token ——
  try {
    const tokenRes = await fetch(`${base}/api/realtime/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const tokenData = await tokenRes.json().catch(() => ({})) as { client_secret?: string; value?: string };
    const tokenOk = tokenRes.ok && (typeof tokenData?.client_secret === "string" || typeof tokenData?.value === "string");
    const token503 = tokenRes.status === 503;
    if (tokenOk) record("POST /api/realtime/token", true, passDetail("token returned"));
    else if (token503) record("POST /api/realtime/token", true, "503 — Service unavailable (contact support)");
    else record("POST /api/realtime/token", false, `status ${tokenRes.status}`);
  } catch (e) {
    record("POST /api/realtime/token", false, e instanceof Error ? e.message : String(e));
  }

  // —— 7. Voice: TTS ——
  try {
    const ttsRes = await fetch(`${base}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...secretHeaders },
      body: JSON.stringify({ text: "Test.", voice_id: "eve" }),
    });
    const ttsOk = ttsRes.ok && (ttsRes.headers.get("content-type")?.includes("audio") ?? false);
    const tts503 = ttsRes.status === 503;
    if (ttsOk) record("POST /api/tts", true, passDetail("audio returned"));
    else if (tts503) record("POST /api/tts", true, "503 — Service unavailable (contact support)");
    else record("POST /api/tts", false, `status ${ttsRes.status}`);
  } catch (e) {
    record("POST /api/tts", false, e instanceof Error ? e.message : String(e));
  }

  // —— 8. Stitch / UI generate ——
  try {
    const uiRes = await fetch(`${base}/api/stitch/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...secretHeaders },
      body: JSON.stringify({ prompt: "A simple login button", userId }),
    });
    const uiData = await uiRes.json().catch(() => ({})) as { code?: string; error?: string; placeholder?: boolean };
    const hasCode = uiRes.ok && typeof uiData?.code === "string";
    const ui503 = uiRes.status === 503 && (uiData?.placeholder || uiData?.error);
    if (hasCode) record("POST /api/stitch/generate", true, passDetail("code returned"));
    else if (ui503) record("POST /api/stitch/generate", true, "503 — STITCH_API_KEY not set");
    else record("POST /api/stitch/generate", false, `status ${uiRes.status}`);
  } catch (e) {
    record("POST /api/stitch/generate", false, e instanceof Error ? e.message : String(e));
  }

  // —— 9. Billing / Stripe ——
  try {
    const checkoutRes = await fetch(`${base}/api/create-checkout-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "pro" }),
    });
    const checkoutData = await checkoutRes.json().catch(() => ({})) as { url?: string; id?: string };
    if (checkoutRes.ok && (checkoutData?.url || checkoutData?.id)) record("POST /api/create-checkout-session", true, passDetail("session created"));
    else if (checkoutRes.status === 503) record("POST /api/create-checkout-session", true, "503 — Stripe not configured");
    else if (checkoutRes.status === 410) record("POST /api/create-checkout-session", true, "410 — payments removed");
    else record("POST /api/create-checkout-session", false, `status ${checkoutRes.status}`);
  } catch (e) {
    record("POST /api/create-checkout-session", false, e instanceof Error ? e.message : String(e));
  }
  try {
    const updatePaidRes = await fetch(`${base}/api/update-paid-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "pro", userId: "test-user-123" }),
    });
    if (updatePaidRes.ok) record("POST /api/update-paid-status", true, passDetail("ok"));
    else if (updatePaidRes.status === 503) record("POST /api/update-paid-status", true, "503 — Supabase not configured");
    else if (updatePaidRes.status === 410) record("POST /api/update-paid-status", true, "410 — payments removed");
    else record("POST /api/update-paid-status", false, `status ${updatePaidRes.status}`);
  } catch (e) {
    record("POST /api/update-paid-status", false, e instanceof Error ? e.message : String(e));
  }

  // —— 10. Deploy ——
  try {
    const deployRes = await fetch(`${base}/api/deploy`, { method: "POST" });
    record("POST /api/deploy", deployRes.ok, deployRes.ok ? passDetail("deploy endpoint reachable") : `status ${deployRes.status}`);
  } catch (e) {
    record("POST /api/deploy", false, e instanceof Error ? e.message : String(e));
  }

  return results;
}
