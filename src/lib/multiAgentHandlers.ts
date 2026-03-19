/**
 * Code Agent + Deploy Agent HTTP handlers (shared by server.ts and api/index.ts).
 * Real side effects: Grok → optional GitHub commit → optional Vercel preview.
 */

import { AGENT_SYSTEM_PROMPT } from "../config/agentConfig.js";
import { CODE_AGENT_SYSTEM, CODE_AGENT_DEBUG_SUFFIX } from "../config/codeAgentPrompts.js";
import { buildGrokChatErrorBody } from "./grokApiError.js";
import { putGithubFile } from "./githubAgentCommit.js";
import {
  createVercelGithubPreviewDeployment,
  triggerVercelDeployHook,
} from "./vercelAgentDeploy.js";
import { XAI_CHAT_COMPLETIONS_URL } from "../config/xaiGrok.js";
import { GROK_MULTI_AGENT } from "./grokModelSelection.js";

export type CodeAgentRequestBody = {
  instruction?: string;
  app_tsx?: string;
  package_json?: string;
  self_debug?: boolean;
};

export type ParsedCodeAgentJson = {
  summary: string;
  app_tsx: string;
  package_json: string | null;
  commit_message: string;
  self_check: string;
};

export function parseCodeAgentResponse(content: string): ParsedCodeAgentJson | null {
  const trimmed = content.trim();
  let jsonStr = "";
  if (trimmed.startsWith("{")) {
    jsonStr = trimmed;
  } else {
    const m = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) jsonStr = m[1].trim();
    else return null;
  }
  try {
    const o = JSON.parse(jsonStr) as Record<string, unknown>;
    const summary = typeof o.summary === "string" ? o.summary : "";
    const app_tsx = typeof o.app_tsx === "string" ? o.app_tsx : "";
    const commit_message = typeof o.commit_message === "string" ? o.commit_message : "chore: update app";
    const self_check = typeof o.self_check === "string" ? o.self_check : "";
    const package_json =
      o.package_json === null || o.package_json === undefined
        ? null
        : typeof o.package_json === "string"
          ? o.package_json
          : null;
    if (!app_tsx.trim()) return null;
    return { summary, app_tsx, package_json, commit_message, self_check };
  } catch {
    return null;
  }
}

async function grokCompletion(
  apiKey: string,
  model: string,
  messages: { role: "system" | "user" | "assistant"; content: string }[]
): Promise<{ ok: true; content: string } | { ok: false; status: number; body: Record<string, unknown> }> {
  const r = await fetch(XAI_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, stream: false }),
  });
  const errText = await r.text();
  if (!r.ok) {
    return { ok: false, status: r.status, body: buildGrokChatErrorBody(errText) as unknown as Record<string, unknown> };
  }
  let data: { choices?: { message?: { content?: unknown } }[] } | null = null;
  try {
    data = JSON.parse(errText) as { choices?: { message?: { content?: unknown } }[] };
  } catch {
    return {
      ok: false,
      status: 502,
      body: { error: "Invalid Grok JSON", details: errText.slice(0, 200) },
    };
  }
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    return { ok: false, status: 502, body: { error: "Empty Grok content" } };
  }
  return { ok: true, content };
}

export async function runCodeAgentPipeline(
  apiKey: string,
  body: CodeAgentRequestBody,
  env: NodeJS.ProcessEnv
): Promise<Record<string, unknown>> {
  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  const appTsx = typeof body.app_tsx === "string" ? body.app_tsx : "";
  const packageJson = typeof body.package_json === "string" ? body.package_json : "{}";
  if (!instruction) {
    return { error: "instruction required" };
  }

  const model = (env.GROK_CODE_AGENT_MODEL?.trim() || env.GROK_MODEL?.trim() || GROK_MULTI_AGENT).trim();
  const userPayload = JSON.stringify(
    { instruction, app_tsx: appTsx, package_json: packageJson },
    null,
    0
  );

  const first = await grokCompletion(apiKey, model, [
    {
      role: "system",
      content: `${CODE_AGENT_SYSTEM}\n\nProduct context (truncate if needed):\n${AGENT_SYSTEM_PROMPT.slice(0, 2000)}`,
    },
    { role: "user", content: userPayload },
  ]);

  if (first.ok === false) {
    return { error: "grok_failed", status: first.status, ...first.body };
  }

  let parsed = parseCodeAgentResponse(first.content);
  if (!parsed) {
    return {
      error: "code_agent_parse_failed",
      details: "Model did not return valid JSON; try again or shorten the instruction.",
      raw_preview: first.content.slice(0, 500),
    };
  }

  if (body.self_debug) {
    const second = await grokCompletion(apiKey, model, [
      {
        role: "system",
        content: `${CODE_AGENT_SYSTEM}\n\nProduct context:\n${AGENT_SYSTEM_PROMPT.slice(0, 1500)}`,
      },
      { role: "assistant", content: first.content },
      { role: "user", content: CODE_AGENT_DEBUG_SUFFIX },
    ]);
    if (second.ok) {
      const p2 = parseCodeAgentResponse(second.content);
      if (p2) parsed = p2;
    }
  }

  const token = env.GITHUB_TOKEN?.trim();
  const owner = env.GITHUB_AGENT_OWNER?.trim();
  const repo = env.GITHUB_AGENT_REPO?.trim();
  const branch = env.GITHUB_AGENT_BRANCH?.trim() || "main";

  let commit: { sha: string; url: string; paths: string[] } | undefined;
  if (token && owner && repo) {
    const paths: string[] = [];
    try {
      const r1 = await putGithubFile({
        token,
        owner,
        repo,
        path: "App.tsx",
        content: parsed.app_tsx,
        message: parsed.commit_message,
        branch,
      });
      paths.push("App.tsx");
      if (parsed.package_json) {
        await putGithubFile({
          token,
          owner,
          repo,
          path: "package.json",
          content: parsed.package_json,
          message: `${parsed.commit_message} (package.json)`,
          branch,
        });
        paths.push("package.json");
      }
      commit = { sha: r1.sha, url: r1.url, paths };
    } catch (e) {
      return {
        error: "github_commit_failed",
        message: e instanceof Error ? e.message : String(e),
        code_agent: {
          summary: parsed.summary,
          app_tsx: parsed.app_tsx,
          package_json: parsed.package_json,
          self_check: parsed.self_check,
        },
      };
    }
  }

  return {
    ok: true,
    code_agent: {
      summary: parsed.summary,
      app_tsx: parsed.app_tsx,
      package_json: parsed.package_json,
      self_check: parsed.self_check,
      commit_message: parsed.commit_message,
    },
    commit: commit ?? null,
    github_configured: !!(token && owner && repo),
  };
}

export async function runDeployAgentPipeline(env: NodeJS.ProcessEnv): Promise<Record<string, unknown>> {
  const hook = env.VERCEL_DEPLOY_HOOK_URL?.trim();
  if (hook) {
    const r = await triggerVercelDeployHook(hook);
    if (!r.ok) {
      return { error: "vercel_hook_failed", status: r.status, text: r.text };
    }
    return {
      ok: true,
      via: "deploy_hook",
      message: "Deploy hook triggered; check Vercel dashboard for preview URL.",
    };
  }

  const token = env.VERCEL_ACCESS_TOKEN?.trim();
  const projectId = env.VERCEL_PROJECT_ID?.trim();
  const org = env.GITHUB_AGENT_OWNER?.trim();
  const repo = env.GITHUB_AGENT_REPO?.trim();
  const ref = env.GITHUB_AGENT_BRANCH?.trim() || "main";
  const teamId = env.VERCEL_TEAM_ID?.trim();

  if (!token || !projectId || !org || !repo) {
    return {
      error: "deploy_not_configured",
      hint: "Set VERCEL_DEPLOY_HOOK_URL, or VERCEL_ACCESS_TOKEN + VERCEL_PROJECT_ID + GITHUB_AGENT_OWNER + GITHUB_AGENT_REPO (+ optional VERCEL_TEAM_ID).",
    };
  }

  try {
    const dep = await createVercelGithubPreviewDeployment({
      token,
      projectId,
      org,
      repo,
      ref,
      teamId: teamId || undefined,
    });
    return {
      ok: true,
      via: "vercel_api",
      preview_url: dep.url,
      deployment_id: dep.id,
      ready_state: dep.readyState,
      inspector_url: dep.inspectorUrl,
    };
  } catch (e) {
    return {
      error: "vercel_deploy_failed",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}
