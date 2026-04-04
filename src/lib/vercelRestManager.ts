/**
 * Nebulla in-app Vercel manager — server-only REST helpers (api.vercel.com).
 * Token: VERCEL_TOKEN (preferred) or VERCEL_ACCESS_TOKEN.
 */

import { createVercelGithubDeployment } from "./vercelAgentDeploy.js";

const VERCEL_API = "https://api.vercel.com";

export function getVercelBearerToken(): string | undefined {
  const t = process.env.VERCEL_TOKEN?.trim() || process.env.VERCEL_ACCESS_TOKEN?.trim();
  return t && t !== "PLACEHOLDER" ? t : undefined;
}

function withTeamQuery(path: string): string {
  const tid = process.env.VERCEL_TEAM_ID?.trim();
  if (!tid) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}teamId=${encodeURIComponent(tid)}`;
}

function requireVercelConfig(): { token: string; projectId: string } {
  const token = getVercelBearerToken();
  const projectId = process.env.VERCEL_PROJECT_ID?.trim();
  if (!token) {
    throw new Error("Set VERCEL_TOKEN or VERCEL_ACCESS_TOKEN on the server.");
  }
  if (!projectId) {
    throw new Error("Set VERCEL_PROJECT_ID on the server.");
  }
  return { token, projectId };
}

function githubSource(ref: string): { org: string; repo: string; ref: string } {
  const org = process.env.GITHUB_AGENT_OWNER?.trim();
  const repo = process.env.GITHUB_AGENT_REPO?.trim();
  if (!org || !repo) {
    throw new Error("Set GITHUB_AGENT_OWNER and GITHUB_AGENT_REPO for Git-backed deploys.");
  }
  return { org, repo, ref: ref.trim() || "main" };
}

function resolveGitRef(override?: string): string {
  const fromEnv =
    override?.trim() ||
    process.env.VERCEL_GIT_COMMIT_REF?.trim() ||
    process.env.GITHUB_AGENT_BRANCH?.trim() ||
    "main";
  return fromEnv;
}

async function vercelJson<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T }> {
  const { token } = requireVercelConfig();
  const url = path.startsWith("http") ? path : `${VERCEL_API}${path}`;
  const r = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers as Record<string, string>),
    },
  });
  const data = (await r.json().catch(() => ({}))) as T;
  return { ok: r.ok, status: r.status, data };
}

export type VercelManagerBody = {
  message?: string;
  action?: string;
  domain?: string;
  branch?: string;
  enableWaf?: boolean;
};

export type VercelManagerAction =
  | "status"
  | "deploy_production"
  | "deploy_preview"
  | "list_domains"
  | "add_domain"
  | "analytics"
  | "firewall"
  | "toggle_waf"
  | "blob_hint"
  | "unknown";

export function parseVercelManagerMessage(msg: string): { action: VercelManagerAction; domain?: string } {
  const s = msg.trim().toLowerCase();
  if (!s) return { action: "status" };
  if (/^deploy(\s+now)?\s*$/i.test(msg.trim()) || /\bproduction deploy\b/.test(s) || (s.includes("deploy") && s.includes("production"))) {
    return { action: "deploy_production" };
  }
  if (s === "preview" || /\bpreview deploy/.test(s) || (s.includes("preview") && s.includes("deployment"))) {
    return { action: "deploy_preview" };
  }
  if (/\blist\s+domains?\b/.test(s) || s === "domains") {
    return { action: "list_domains" };
  }
  const addMatch = s.match(/\badd\s+domain\s+(\S+)/);
  if (addMatch) return { action: "add_domain", domain: addMatch[1] };
  if (/\banalytics\b/.test(s)) return { action: "analytics" };
  if (/\bfirewall\b/.test(s) || /\bsecurity\b/.test(s) || /\bwaf\b/.test(s)) {
    return { action: "firewall" };
  }
  if (/\benable\s+waf\b/.test(s) || /\bdisable\s+waf\b/.test(s) || /\bwaf\s+(on|off)\b/.test(s)) {
    return { action: "toggle_waf" };
  }
  if (/\bupload\b/.test(s) || /\bstorage\b/.test(s) || /\bblob\b/.test(s)) {
    return { action: "blob_hint" };
  }
  return { action: "unknown" };
}

function normalizeAction(body: VercelManagerBody): { action: VercelManagerAction; domain?: string } {
  const raw = body.action?.trim().toLowerCase();
  if (raw === "deploy" || raw === "production" || raw === "deploy_production") {
    return { action: "deploy_production" };
  }
  if (raw === "preview" || raw === "deploy_preview") {
    return { action: "deploy_preview" };
  }
  if (raw === "list_domains" || raw === "domains") {
    return { action: "list_domains" };
  }
  if (raw === "add_domain") {
    if (body.domain?.trim()) return { action: "add_domain", domain: body.domain.trim() };
    if (body.message?.trim()) return parseVercelManagerMessage(body.message);
    return { action: "add_domain" };
  }
  if (raw === "analytics") return { action: "analytics" };
  if (raw === "firewall" || raw === "security") return { action: "firewall" };
  if (raw === "toggle_waf") return { action: "toggle_waf" };
  if (raw === "blob" || raw === "storage") return { action: "blob_hint" };
  if (body.message?.trim()) {
    return parseVercelManagerMessage(body.message);
  }
  return { action: "status" };
}

async function fetchDeploymentLogLines(deploymentId: string, limit = 40): Promise<string[]> {
  const { token } = requireVercelConfig();
  const q = withTeamQuery(`/v2/deployments/${encodeURIComponent(deploymentId)}/events?limit=${limit}`);
  const r = await fetch(`${VERCEL_API}${q}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return [`(Could not load events: HTTP ${r.status})`];
  const rows = (await r.json()) as unknown;
  if (!Array.isArray(rows)) return [];
  return rows.slice(-limit).map((ev) => {
    const o = ev as { type?: string; payload?: { text?: string; deploymentId?: string }; text?: string };
    const t = o.payload?.text ?? o.text ?? o.type ?? JSON.stringify(ev).slice(0, 120);
    return String(t);
  });
}

export function getVercelManagerStatusPayload(): Record<string, unknown> {
  const token = !!getVercelBearerToken();
  const projectId = !!process.env.VERCEL_PROJECT_ID?.trim();
  const github = !!(process.env.GITHUB_AGENT_OWNER?.trim() && process.env.GITHUB_AGENT_REPO?.trim());
  return {
    ok: true,
    line: "Vercel integration active. What do you want to do?",
    configured: {
      token,
      projectId,
      github,
      blob: !!(process.env.BLOB_READ_WRITE_TOKEN?.trim() && process.env.BLOB_READ_WRITE_TOKEN !== "PLACEHOLDER"),
    },
  };
}

export async function runVercelManagerCommand(body: VercelManagerBody): Promise<Record<string, unknown>> {
  const { action, domain: parsedDomain } = normalizeAction(body);
  const domain = body.domain?.trim() || parsedDomain;

  if (action === "status" || action === "unknown") {
    return {
      ...getVercelManagerStatusPayload(),
      reply:
        action === "unknown"
          ? "Say deploy, preview, list domains, add domain example.com, analytics, firewall, or upload via POST /api/vercel/blob."
          : "Vercel integration active. What do you want to do?",
    };
  }

  if (action === "blob_hint") {
    return {
      reply: "Upload files with POST /api/vercel/blob JSON: { filename, contentBase64, contentType? }. Requires BLOB_READ_WRITE_TOKEN.",
      line: "Vercel integration active. What do you want to do?",
    };
  }

  if (action === "toggle_waf") {
    const wantOn = /\benable\b|\bon\b/.test((body.message ?? "").toLowerCase());
    return {
      reply: wantOn
        ? "WAF: enable Attack Challenge Mode and rules in Vercel → Project → Firewall. There is no simple public REST toggle for this token scope."
        : "WAF: adjust or disable rules in Vercel → Project → Firewall. Enterprise plans expose more API control.",
      waf: { dashboardPath: "/Firewall", note: "Toggle via Vercel dashboard for this project." },
      line: "Vercel integration active. What do you want to do?",
    };
  }

  if (action === "firewall") {
    return {
      reply:
        "WAF lives under Vercel → your project → Firewall (rules, challenge mode, IP blocks). Full programmatic firewall API is limited; use the dashboard to toggle protection.",
      waf: { status: "configure_in_dashboard", allowApiToggle: false },
      line: "Vercel integration active. What do you want to do?",
    };
  }

  const { token, projectId } = requireVercelConfig();
  const teamId = process.env.VERCEL_TEAM_ID?.trim();

  try {
    if (action === "deploy_production" || action === "deploy_preview") {
      const ref = resolveGitRef(body.branch);
      const { org, repo } = githubSource(ref);
      const dep = await createVercelGithubDeployment({
        token,
        projectId,
        org,
        repo,
        ref,
        teamId: teamId || undefined,
        target: action === "deploy_production" ? "production" : "preview",
      });
      const id = dep.id;
      const logs = id ? await fetchDeploymentLogLines(id, 35) : [];
      return {
        reply: `Deployment ${action === "deploy_production" ? "production" : "preview"} started. URL: ${dep.url ?? "(pending)"}. State: ${dep.readyState ?? "unknown"}.`,
        deployment: { id: dep.id, url: dep.url, readyState: dep.readyState, inspectorUrl: dep.inspectorUrl, target: action === "deploy_production" ? "production" : "preview", ref },
        logs,
        line: "Vercel integration active. What do you want to do?",
      };
    }

    if (action === "list_domains") {
      const path = withTeamQuery(`/v9/projects/${encodeURIComponent(projectId)}/domains`);
      const { ok, status, data } = await vercelJson<{ domains?: Array<{ name?: string; verified?: boolean; verification?: unknown }> }>(path);
      if (!ok) {
        return { reply: `List domains failed (HTTP ${status}).`, error: data, line: "Vercel integration active. What do you want to do?" };
      }
      const rawList = Array.isArray(data) ? data : data.domains ?? [];
      const list = rawList.map((d) => ({
        name: (d as { name?: string }).name,
        verified: (d as { verified?: boolean }).verified,
      }));
      return {
        reply: list.length ? list.map((d) => `${d.name}${d.verified ? " ✓" : " (pending)"}`).join("; ") : "No domains on this project yet.",
        domains: list,
        line: "Vercel integration active. What do you want to do?",
      };
    }

    if (action === "add_domain") {
      if (!domain) {
        return { reply: "Which domain? Example: add domain example.com", line: "Vercel integration active. What do you want to do?" };
      }
      const path = withTeamQuery(`/v10/projects/${encodeURIComponent(projectId)}/domains`);
      const { ok, status, data } = await vercelJson<Record<string, unknown>>(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: domain }),
      });
      if (!ok) {
        const msg =
          typeof (data as { error?: { message?: string } }).error?.message === "string"
            ? (data as { error: { message: string } }).error.message
            : `HTTP ${status}`;
        return { reply: `Add domain failed: ${msg}`, error: data, line: "Vercel integration active. What do you want to do?" };
      }
      return {
        reply: `Added ${domain}. Point DNS: A 76.76.21.21 or CNAME to cname.vercel-dns.com (or follow the verification record Vercel shows for this domain).`,
        domain: data,
        dns: { A: "76.76.21.21", CNAME: "cname.vercel-dns.com" },
        line: "Vercel integration active. What do you want to do?",
      };
    }

    if (action === "analytics") {
      const path = withTeamQuery(`/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=20`);
      const { ok, status, data } = await vercelJson<{ deployments?: Array<{ url?: string; state?: string; readyState?: string; createdAt?: number; target?: string }> }>(path);
      if (!ok) {
        return { reply: `Deployments fetch failed (HTTP ${status}).`, error: data, line: "Vercel integration active. What do you want to do?" };
      }
      const deps = data.deployments ?? [];
      const byState: Record<string, number> = {};
      for (const d of deps) {
        const k = d.readyState || d.state || "unknown";
        byState[k] = (byState[k] ?? 0) + 1;
      }
      return {
        reply: `Recent activity: ${deps.length} deployments sampled. States: ${JSON.stringify(byState)}. For visits, bandwidth, and Web Analytics, use Vercel → Analytics (this API path returns deployment summaries only).`,
        deploymentsSample: deps.slice(0, 10).map((d) => ({
          url: d.url ? `https://${d.url}` : null,
          state: d.readyState || d.state,
          target: d.target,
          createdAt: d.createdAt,
        })),
        line: "Vercel integration active. What do you want to do?",
      };
    }
  } catch (e) {
    return {
      reply: e instanceof Error ? e.message : String(e),
      error: true,
      line: "Vercel integration active. What do you want to do?",
    };
  }

  return getVercelManagerStatusPayload();
}

export async function uploadVercelBlobJson(body: {
  filename?: string;
  contentBase64?: string;
  contentType?: string;
}): Promise<{ reply: string; url: string; pathname: string }> {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token || token === "PLACEHOLDER") {
    throw new Error("Set BLOB_READ_WRITE_TOKEN on the server for Vercel Blob uploads.");
  }
  const filename = (body.filename ?? "file").replace(/[^\w.-]+/g, "_").slice(0, 180);
  const b64 = body.contentBase64?.trim();
  if (!b64) {
    throw new Error("Missing contentBase64.");
  }
  const buf = Buffer.from(b64, "base64");
  if (buf.length > 12 * 1024 * 1024) {
    throw new Error("File too large (max 12MB for this route).");
  }
  const { put } = await import("@vercel/blob");
  const pathname = `nebulla/${Date.now()}-${filename}`;
  const blob = await put(pathname, buf, {
    access: "public",
    token,
    contentType: body.contentType?.trim() || "application/octet-stream",
  });
  return {
    reply: `Uploaded. Public URL: ${blob.url}`,
    url: blob.url,
    pathname: blob.pathname,
  };
}
