/**
 * Run: npm run dev (in another terminal), then: node scripts/test-all.mjs
 * Or: START_SERVER=1 node scripts/test-all.mjs  (script starts server on port 3077)
 */
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] || "http://localhost:3000";
const START_SERVER = process.env.START_SERVER === "1";
const TEST_PORT = 3077;

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail: detail || "" });
  console.log("  [" + (ok ? "PASS" : "FAIL") + "] " + name + (detail ? " — " + detail : ""));
}

/** When START_SERVER=1, requests need Origin so server treats as open-mode (localhost) and applies OPEN_MODE_FALLBACK_USER_ID. */
function openModeHeaders(base) {
  if (!START_SERVER || !base) return {};
  try {
    const u = new URL(base);
    return { Origin: u.origin };
  } catch (_) {
    return {};
  }
}

async function waitForServer(url, maxWait) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const r = await fetch(url, { method: "GET", signal: AbortSignal.timeout(2000) });
      if (r.status < 500) return true;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function runTests() {
  console.log("\n=== kyn full functionality test ===\n");
  let testBase = BASE;
  let serverProcess = null;
  const openModeUserId = "test-open-mode-user-" + Date.now();

  if (START_SERVER) {
    console.log("Starting server on port " + TEST_PORT + "...");
    serverProcess = spawn("npx", ["tsx", "server.ts"], {
      env: {
        ...process.env,
        PORT: String(TEST_PORT),
        NODE_ENV: "test",
        OPEN_MODE_FALLBACK_USER_ID: openModeUserId,
        OPEN_MODE_ORIGIN: "", // allow fallback for localhost (no origin check)
        SUPABASE_URL: "", // force SQLite for reproducible audit
        SUPABASE_PUBLISHABLE_KEY: "",
        SUPABASE_SECRET_KEY: "",
      },
      cwd: join(__dirname, ".."),
      stdio: ["ignore", "pipe", "pipe"],
    });
    testBase = "http://127.0.0.1:" + TEST_PORT;
    const ready = await waitForServer(testBase + "/", 20000);
    if (!ready) {
      console.error("Server did not start. Run: npm run dev");
      process.exit(1);
    }
    console.log("Server ready.\n");
  } else {
    console.log("Base URL: " + BASE + " (ensure server is running)\n");
  }

  try {
    console.log("--- 1. Auth / Login-Sign up (session) ---");
    try {
      const sessionRes = await fetch(testBase + "/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const sessionData = await sessionRes.json().catch(() => ({}));
      record("POST /api/auth/session returns userId", sessionRes.ok && typeof sessionData.userId === "string", sessionRes.ok ? "" : String(sessionRes.status));

      const sessionRes2 = await fetch(testBase + "/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "test-user-123" }),
      });
      const sessionData2 = await sessionRes2.json().catch(() => ({}));
      record("POST /api/auth/session echoes userId", sessionRes2.ok && sessionData2.userId === "test-user-123", sessionRes2.ok ? "" : String(sessionRes2.status));
    } catch (e) {
      record("Auth session", false, e.message);
    }

    console.log("\n--- 2. Projects ---");
    const userId = START_SERVER ? openModeUserId : "test-user-" + Date.now();
    const omHeaders = openModeHeaders(testBase);
    try {
      const listRes = await fetch(testBase + "/api/users/" + userId + "/projects", { headers: omHeaders });
      const listJson = await listRes.json().catch(() => null);
      record("GET /api/users/:userId/projects", listRes.ok && Array.isArray(listJson), listRes.ok ? "" : String(listRes.status));

      const limitsRes = await fetch(testBase + "/api/users/" + userId + "/limits", { headers: omHeaders });
      const limitsData = await limitsRes.json().catch(() => ({}));
      record("GET /api/users/:userId/limits", limitsRes.ok && typeof limitsData.projectLimit === "number", limitsRes.ok ? "limit=" + limitsData.projectLimit : String(limitsRes.status));

      const createRes = await fetch(testBase + "/api/users/" + userId + "/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...omHeaders },
        body: JSON.stringify({ name: "Test Project" }),
      });
      const createData = await createRes.json().catch(() => ({}));
      const createOk = createRes.status === 201 && createData && createData.id;
      record("POST /api/users/:userId/projects", createOk, createOk ? "id=" + createData.id : String(createRes.status));

      const projectId = createData && createData.id;
      if (projectId) {
        const getRes = await fetch(testBase + "/api/users/" + userId + "/projects/" + projectId, { headers: omHeaders });
        const getData = await getRes.json().catch(() => ({}));
        record("GET /api/users/:userId/projects/:id", getRes.ok && getData.id, getRes.ok ? "" : String(getRes.status));

        const updateRes = await fetch(testBase + "/api/users/" + userId + "/projects/" + projectId, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...omHeaders },
          body: JSON.stringify({ name: "Updated", last_edited: new Date().toISOString() }),
        });
        const updateData = await updateRes.json().catch(() => ({}));
        record("PUT /api/users/:userId/projects/:id", updateRes.ok && updateData.ok, updateRes.ok ? "" : String(updateRes.status));
      }
    } catch (e) {
      record("Projects", false, e.message);
    }

    console.log("\n--- 3. Agent config ---");
    try {
      const configRes = await fetch(testBase + "/api/agent/config");
      const configData = await configRes.json().catch(() => ({}));
      record("GET /api/agent/config", configRes.ok && configData.agentId && Array.isArray(configData.preCodeQuestions), configRes.ok ? "agentId=" + configData.agentId : String(configRes.status));
    } catch (e) {
      record("Agent config", false, e.message);
    }

    console.log("\n--- 4. Agent chat (Grok) ---");
    try {
      const chatRes = await fetch(testBase + "/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "Say: test" }] }),
      });
      const chatData = await chatRes.json().catch(() => ({}));
      const chatOk = chatRes.ok && chatData.message && typeof chatData.message.content === "string";
      const chat503 = chatRes.status === 503;
      const chat400 = chatRes.status === 400 && (chatData?.error === "Grok API error" || (chatData?.error && String(chatData.error).toLowerCase().includes("grok")));
      if (chatOk) record("POST /api/agent/chat", true, "reply received");
      else if (chat503) record("POST /api/agent/chat", true, "503 (GROK_API_KEY not set)");
      else if (chat400) record("POST /api/agent/chat", true, "400 (Grok API error, key set)");
      else record("POST /api/agent/chat", false, chatRes.status + " " + JSON.stringify(chatData).slice(0, 60));
    } catch (e) {
      record("Agent chat", false, e.message);
    }

    console.log("\n--- 5. UI generation (Google Stitch) ---");
    try {
      const uiRes = await fetch(testBase + "/api/stitch/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "A simple login button", userId: userId }),
      });
      const uiData = await uiRes.json().catch(() => ({}));
      const hasCode = uiRes.ok && uiData && typeof uiData.code === "string";
      const ui503 = uiRes.status === 503 && (uiData.placeholder || uiData.error);
      if (hasCode) record("POST /api/stitch/generate", true, "code returned");
      else if (ui503) record("POST /api/stitch/generate", true, "503 (STITCH_API_KEY not set)");
      else record("POST /api/stitch/generate", false, uiRes.status + " " + JSON.stringify(uiData).slice(0, 60));
    } catch (e) {
      record("Builder UI generate", false, e.message);
    }

    console.log("\n--- 6. Stripe & update-paid-status (410 = removed) ---");
    try {
      const checkoutRes = await fetch(testBase + "/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "prototype" }),
      });
      const checkoutData = await checkoutRes.json().catch(() => ({}));
      if (checkoutRes.ok && (checkoutData.url || checkoutData.id)) record("POST /api/create-checkout-session", true, "session");
      else if (checkoutRes.status === 503) record("POST /api/create-checkout-session", true, "503 (Stripe not configured)");
      else if (checkoutRes.status === 410) record("POST /api/create-checkout-session", true, "410 (payments removed)");
      else record("POST /api/create-checkout-session", false, String(checkoutRes.status));

      const updatePaidRes = await fetch(testBase + "/api/update-paid-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "prototype", userId: "test-user-123" }),
      });
      if (updatePaidRes.ok) record("POST /api/update-paid-status", true, "ok");
      else if (updatePaidRes.status === 503) record("POST /api/update-paid-status", true, "503 (Supabase not configured)");
      else if (updatePaidRes.status === 410) record("POST /api/update-paid-status", true, "410 (payments removed)");
      else record("POST /api/update-paid-status", false, String(updatePaidRes.status));
    } catch (e) {
      record("Stripe/update-paid", false, e.message);
    }

    console.log("\n--- 7. Deploy mocks ---");
    try {
      const deployRes = await fetch(testBase + "/api/deploy", { method: "POST" });
      record("POST /api/deploy", deployRes.ok, deployRes.ok ? "mock ok" : String(deployRes.status));
    } catch (e) {
      record("Deploy mocks", false, e.message);
    }

    console.log("\n--- 8. Secrets audit & production readiness ---");
    try {
      const secRes = await fetch(testBase + "/api/config/secrets-audit");
      const secData = await secRes.json().catch(() => ({}));
      record(
        "GET /api/config/secrets-audit",
        secRes.ok && Array.isArray(secData.items),
        secRes.ok ? "items=" + (secData.items?.length ?? 0) : String(secRes.status)
      );
      const prRes = await fetch(testBase + "/api/config/production-readiness");
      const prData = await prRes.json().catch(() => ({}));
      record(
        "GET /api/config/production-readiness",
        prRes.ok && Array.isArray(prData.productionChecklist),
        prRes.ok ? "coreConfigured=" + !!prData.coreConfigured : String(prRes.status)
      );
      const alRes = await fetch(testBase + "/api/config/secrets-alignment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ browserSecrets: {} }),
      });
      const alData = await alRes.json().catch(() => ({}));
      record(
        "POST /api/config/secrets-alignment",
        alRes.ok && Array.isArray(alData.rows),
        alRes.ok ? "rows=" + (alData.rows?.length ?? 0) : String(alRes.status)
      );
      const intRes = await fetch(testBase + "/api/integrations/summary");
      const intData = await intRes.json().catch(() => ({}));
      record(
        "GET /api/integrations/summary",
        intRes.ok && intData.architecture === "backend-first-monorepo",
        intRes.ok ? "backend-first map" : String(intRes.status)
      );
    } catch (e) {
      record("Secrets audit bundle", false, e.message);
    }
  } finally {
    if (serverProcess) {
      serverProcess.kill("SIGTERM");
      console.log("\nServer stopped.");
    }
  }

  const passed = results.filter(function (r) { return r.ok; }).length;
  const failed = results.filter(function (r) { return !r.ok; }).length;
  console.log("\n=== REPORT ===\n");
  console.log("Total: " + results.length + "  Passed: " + passed + "  Failed: " + failed);
  if (failed > 0) {
    console.log("\nFailed:");
    results.filter(function (r) { return !r.ok; }).forEach(function (r) { console.log("  - " + r.name + " " + r.detail); });
  }
  console.log("\n--- End of report ---\n");
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(function (err) {
  console.error(err);
  process.exit(1);
});
