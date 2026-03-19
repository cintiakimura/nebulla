import { getBackendSecretHeaders } from "./storedSecrets";
import { pushAgentTaskMemory } from "./multiAgentMemory";

export type ChainLogFn = (line: string) => void;

/**
 * Code Agent → (optional) Deploy Agent. Uses real /api/agents/* endpoints.
 */
export async function runBuilderAgentChain(
  apiBase: string,
  params: {
    instruction: string;
    app_tsx: string;
    package_json: string;
    self_debug?: boolean;
  },
  log: ChainLogFn
): Promise<{
  codeResult: Record<string, unknown>;
  deployResult: Record<string, unknown> | null;
  appliedCode?: string;
}> {
  const headers = { "Content-Type": "application/json", ...getBackendSecretHeaders() };
  log("[Code Agent] Running Grok + optional GitHub commit…");
  const codeRes = await fetch(`${apiBase}/api/agents/code-run`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      instruction: params.instruction,
      app_tsx: params.app_tsx,
      package_json: params.package_json,
      self_debug: params.self_debug ?? true,
    }),
  });
  const codeResult = (await codeRes.json().catch(() => ({}))) as Record<string, unknown>;
  if (!codeRes.ok) {
    log(`[Code Agent] Failed: ${codeRes.status} ${JSON.stringify(codeResult).slice(0, 400)}`);
    pushAgentTaskMemory({
      kind: "code",
      status: "error",
      summary: String(codeResult.error ?? codeRes.status),
    });
    return { codeResult, deployResult: null };
  }
  const ca = codeResult.code_agent as { summary?: string; app_tsx?: string } | undefined;
  if (ca?.summary) log(`[Code Agent] ${ca.summary}`);
  const commit = codeResult.commit as { url?: string; sha?: string } | null | undefined;
  if (commit?.url) log(`[Code Agent] Commit: ${commit.url}`);
  else if (codeResult.github_configured === false) {
    log("[Code Agent] GitHub not configured on server — code returned only (no commit).");
  }
  pushAgentTaskMemory({
    kind: "code",
    status: "ok",
    summary: ca?.summary?.slice(0, 200) ?? "code run",
    commit_url: commit?.url,
  });

  log("[Deploy Agent] Triggering Vercel preview…");
  const depRes = await fetch(`${apiBase}/api/agents/deploy-run`, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });
  const deployResult = (await depRes.json().catch(() => ({}))) as Record<string, unknown>;
  if (!depRes.ok) {
    log(`[Deploy Agent] ${depRes.status}: ${JSON.stringify(deployResult).slice(0, 300)}`);
    pushAgentTaskMemory({
      kind: "deploy",
      status: "error",
      summary: String(deployResult.error ?? depRes.status),
    });
    return {
      codeResult,
      deployResult,
      appliedCode: typeof ca?.app_tsx === "string" ? ca.app_tsx : undefined,
    };
  }
  const preview = deployResult.preview_url as string | undefined;
  if (preview) log(`[Deploy Agent] Preview: ${preview}`);
  else log(`[Deploy Agent] ${String(deployResult.message ?? "Triggered — check Vercel dashboard.")}`);
  pushAgentTaskMemory({
    kind: "deploy",
    status: "ok",
    summary: preview ?? "deploy triggered",
    preview_url: preview,
  });
  pushAgentTaskMemory({
    kind: "chain",
    status: "ok",
    summary: `code + deploy: ${(ca?.summary ?? "").slice(0, 80)}`,
    preview_url: preview,
    commit_url: commit?.url,
  });

  return {
    codeResult,
    deployResult,
    appliedCode: typeof ca?.app_tsx === "string" ? ca.app_tsx : undefined,
  };
}
