/**
 * Runs the same API checks as scripts/test-all.mjs from the browser.
 * Returns a list of { name, ok, detail } for each functionality.
 */
export type AuditEntry = { name: string; ok: boolean; detail: string };

export async function runQuickAudit(apiBase: string): Promise<AuditEntry[]> {
  const results: AuditEntry[] = [];
  const base = apiBase.replace(/\/$/, "");

  function record(name: string, ok: boolean, detail: string) {
    results.push({ name, ok, detail: detail || "" });
  }

  try {
    const sessionRes = await fetch(`${base}/api/auth/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const sessionData = await sessionRes.json().catch(() => ({}));
    record(
      "POST /api/auth/session returns userId",
      sessionRes.ok && typeof (sessionData as { userId?: string }).userId === "string",
      sessionRes.ok ? "" : String(sessionRes.status)
    );

    const sessionRes2 = await fetch(`${base}/api/auth/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "test-user-123" }),
    });
    const sessionData2 = await sessionRes2.json().catch(() => ({}));
    record(
      "POST /api/auth/session echoes userId",
      sessionRes2.ok && (sessionData2 as { userId?: string }).userId === "test-user-123",
      sessionRes2.ok ? "" : String(sessionRes2.status)
    );
  } catch (e) {
    record("Auth session", false, e instanceof Error ? e.message : String(e));
  }

  const userId = "test-user-" + Date.now();
  try {
    const listRes = await fetch(`${base}/api/users/${userId}/projects`);
    const listJson = await listRes.json().catch(() => null);
    record("GET /api/users/:userId/projects", listRes.ok && Array.isArray(listJson), listRes.ok ? "" : String(listRes.status));

    const limitsRes = await fetch(`${base}/api/users/${userId}/limits`);
    const limitsData = await limitsRes.json().catch(() => ({}));
    record(
      "GET /api/users/:userId/limits",
      limitsRes.ok && typeof (limitsData as { projectLimit?: number }).projectLimit === "number",
      limitsRes.ok ? "" : String(limitsRes.status)
    );

    const createRes = await fetch(`${base}/api/users/${userId}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test Project" }),
    });
    const createData = await createRes.json().catch(() => ({})) as { id?: string };
    const createOk = createRes.status === 201 && !!createData?.id;
    record("POST /api/users/:userId/projects", createOk, createOk ? `id=${createData.id}` : String(createRes.status));

    const projectId = createData?.id;
    if (projectId) {
      const getRes = await fetch(`${base}/api/users/${userId}/projects/${projectId}`);
      const getData = await getRes.json().catch(() => ({})) as { id?: string };
      record("GET /api/users/:userId/projects/:id", getRes.ok && !!getData.id, getRes.ok ? "" : String(getRes.status));

      const updateRes = await fetch(`${base}/api/users/${userId}/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated", last_edited: new Date().toISOString() }),
      });
      const updateData = await updateRes.json().catch(() => ({})) as { ok?: boolean };
      record("PUT /api/users/:userId/projects/:id", updateRes.ok && !!updateData.ok, updateRes.ok ? "" : String(updateRes.status));
    }
  } catch (e) {
    record("Projects", false, e instanceof Error ? e.message : String(e));
  }

  try {
    const configRes = await fetch(`${base}/api/agent/config`);
    const configData = await configRes.json().catch(() => ({})) as { agentId?: string; preCodeQuestions?: unknown[] };
    record(
      "GET /api/agent/config",
      configRes.ok && !!configData.agentId && Array.isArray(configData.preCodeQuestions),
      configRes.ok ? "" : String(configRes.status)
    );
  } catch (e) {
    record("Agent config", false, e instanceof Error ? e.message : String(e));
  }

  try {
    const chatRes = await fetch(`${base}/api/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "Say: test" }] }),
    });
    const chatData = await chatRes.json().catch(() => ({})) as { message?: { content?: string } };
    const chatOk = chatRes.ok && chatData?.message && typeof chatData.message.content === "string";
    const chat503 = chatRes.status === 503;
    if (chatOk) record("POST /api/agent/chat", true, "reply received");
    else if (chat503) record("POST /api/agent/chat", true, "503 (GROK_API_KEY not set)");
    else record("POST /api/agent/chat", false, String(chatRes.status));
  } catch (e) {
    record("Agent chat", false, e instanceof Error ? e.message : String(e));
  }

  try {
    const uiRes = await fetch(`${base}/api/builder/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "A simple login button", userId }),
    });
    const uiData = await uiRes.json().catch(() => ({})) as { code?: string; error?: string; placeholder?: boolean };
    const hasCode = uiRes.ok && typeof uiData?.code === "string";
    const ui503 = uiRes.status === 503 && (uiData?.placeholder || uiData?.error);
    if (hasCode) record("POST /api/builder/generate", true, "code returned");
    else if (ui503) record("POST /api/builder/generate", true, "503 (BUILDER_PRIVATE_KEY not set)");
    else record("POST /api/builder/generate", false, String(uiRes.status));
  } catch (e) {
    record("Builder UI generate", false, e instanceof Error ? e.message : String(e));
  }

  try {
    const checkoutRes = await fetch(`${base}/api/create-checkout-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "prototype" }),
    });
    const checkoutData = await checkoutRes.json().catch(() => ({})) as { url?: string; id?: string };
    if (checkoutRes.ok && (checkoutData?.url || checkoutData?.id)) record("POST /api/create-checkout-session", true, "session");
    else if (checkoutRes.status === 503) record("POST /api/create-checkout-session", true, "503 (Stripe not configured)");
    else record("POST /api/create-checkout-session", false, String(checkoutRes.status));

    const updatePaidRes = await fetch(`${base}/api/update-paid-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "prototype", userId: "test-user-123" }),
    });
    if (updatePaidRes.ok) record("POST /api/update-paid-status", true, "ok");
    else if (updatePaidRes.status === 503) record("POST /api/update-paid-status", true, "503 (Supabase not configured)");
    else record("POST /api/update-paid-status", false, String(updatePaidRes.status));
  } catch (e) {
    record("Stripe/update-paid", false, e instanceof Error ? e.message : String(e));
  }

  try {
    const deployRes = await fetch(`${base}/api/deploy`, { method: "POST" });
    record("POST /api/deploy", deployRes.ok, deployRes.ok ? "mock ok" : String(deployRes.status));
  } catch (e) {
    record("Deploy mocks", false, e instanceof Error ? e.message : String(e));
  }

  return results;
}
