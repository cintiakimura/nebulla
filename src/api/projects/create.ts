/**
 * POST /api/projects/create — Pro only. Provisions Supabase + Vercel via PAT/token (server env only).
 */
import type { Express, NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { randomBytes } from "node:crypto";
import { Stitch, StitchToolClient, type Project as StitchProject } from "@google/stitch-sdk";
import { extractSvgFromStitchHtml } from "../../lib/stitchMockupSvg.js";
import { createProject, getUserMetadata, updateProject } from "../../lib/supabase-multi-tenant.js";

export type RequestWithUserId = Request & { userId?: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function randomDbPassword(): string {
  const a = randomBytes(18).toString("base64url");
  const b = randomBytes(6).toString("hex");
  return `${a}A1!${b}`;
}

function slugName(raw: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return s || `app-${randomBytes(4).toString("hex")}`;
}

function githubRepoFromUrl(url: string | undefined): string | null {
  if (!url?.trim()) return null;
  const u = url.trim();
  const m = u.match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?\/?$/i);
  return m ? m[1] : null;
}

async function resolveStitchProjectForProvision(sdk: Stitch): Promise<StitchProject> {
  const envId = process.env.STITCH_PROJECT_ID?.trim();
  if (envId) return sdk.project(envId);
  const projects = await sdk.projects();
  if (projects.length > 0) return projects[0]!;
  return sdk.createProject(process.env.STITCH_PROJECT_TITLE?.trim() || "Kyn UI");
}

async function stitchLockedMockupSvg(name: string, repo: string | null): Promise<string | null> {
  const key = (process.env.STITCH_API_KEY || process.env.GOOGLE_STITCH_API_KEY || "").trim();
  if (!key || key === "PLACEHOLDER") return null;
  const client = new StitchToolClient({ apiKey: key });
  try {
    const sdk = new Stitch(client);
    const project = await resolveStitchProjectForProvision(sdk);
    const ctx = `New app: ${name}. ${repo ? `Repository: ${repo}` : "No Git repository linked yet."}`;
    const prompt = `You are generating ONE high-fidelity product mockup as pure vector graphics inside an HTML document.
Output requirements:
- Return a complete valid HTML5 document. Inside <body>, there must be exactly one root element: a single inline SVG.
- The SVG must include xmlns="http://www.w3.org/2000/svg" and a wide viewBox.
- Visual style: dark Nebulla / celestial IDE — near-black blue background (#020617–#020C17), cyan and teal glass panels, thin borders, soft glow.
- Short labels only. No external URLs, no script, no img — SVG elements only.

Context:
${ctx.slice(0, 12000)}`;
    const screen = await project.generate(prompt, "DESKTOP", "GEMINI_3_FLASH");
    const htmlRef = await screen.getHtml();
    let html = "";
    if (htmlRef && /^https?:\/\//i.test(htmlRef)) {
      const hr = await fetch(htmlRef);
      if (!hr.ok) return null;
      html = await hr.text();
    } else {
      html = htmlRef || "";
    }
    const svg = extractSvgFromStitchHtml(html);
    return svg && svg.includes("<svg") ? svg : null;
  } catch (e) {
    console.error("[projects/create] Stitch mockup", e);
    return null;
  } finally {
    await client.close().catch(() => {});
  }
}

async function supabaseManagementCreate(name: string, dbPass: string, pat: string, orgSlug: string): Promise<{
  ref: string;
  id: string;
  status?: string;
}> {
  const res = await fetch("https://api.supabase.com/v1/projects", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pat}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      db_pass: dbPass,
      organization_slug: orgSlug,
      region: "us-east-1",
    }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 429) {
    const err = new Error("rate_limited") as Error & { status?: number };
    err.status = 429;
    throw err;
  }
  if (!res.ok) {
    console.error("[projects/create] Supabase management", res.status, data);
    const err = new Error(typeof data.message === "string" ? data.message : `supabase_create_${res.status}`) as Error & {
      status?: number;
    };
    err.status = res.status >= 400 && res.status < 600 ? res.status : 500;
    throw err;
  }
  const ref = typeof data.ref === "string" ? data.ref : "";
  const id = typeof data.id === "string" ? data.id : ref;
  if (!ref) {
    console.error("[projects/create] Supabase response missing ref", data);
    throw new Error("supabase_invalid_response");
  }
  return { ref, id, status: typeof data.status === "string" ? data.status : undefined };
}

async function supabaseFetchApiKeys(
  ref: string,
  pat: string
): Promise<{ anon?: string; serviceRole?: string }> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(ref)}/api-keys`, {
    headers: { Authorization: `Bearer ${pat}` },
  });
  const list = (await res.json().catch(() => [])) as Array<{ name?: string; api_key?: string }>;
  if (!res.ok || !Array.isArray(list)) {
    console.error("[projects/create] Supabase api-keys", res.status);
    return {};
  }
  let anon: string | undefined;
  let serviceRole: string | undefined;
  for (const row of list) {
    const n = (row.name || "").toLowerCase();
    if (n.includes("anon")) anon = row.api_key;
    if (n.includes("service") && n.includes("role")) serviceRole = row.api_key;
  }
  return { anon, serviceRole };
}

async function vercelCreateProject(
  name: string,
  token: string,
  githubRepo: string | null
): Promise<{ id: string; url: string | null }> {
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const q = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  const body: Record<string, unknown> = { name };
  if (githubRepo) {
    body.gitRepository = { type: "github", repo: githubRepo };
  }
  const res = await fetch(`https://api.vercel.com/v11/projects${q}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 429) {
    const err = new Error("rate_limited") as Error & { status?: number };
    err.status = 429;
    throw err;
  }
  if (!res.ok) {
    console.error("[projects/create] Vercel", res.status, data);
    const vercelErr = data.error as { message?: string } | undefined;
    const err = new Error(
      typeof vercelErr?.message === "string" ? vercelErr.message : `vercel_create_${res.status}`
    ) as Error & {
      status?: number;
    };
    err.status = res.status >= 400 && res.status < 600 ? res.status : 500;
    throw err;
  }
  const id = typeof data.id === "string" ? data.id : "";
  const link = data.link as { url?: string } | undefined;
  const url = typeof link?.url === "string" ? link.url : null;
  return { id, url };
}

export function registerPostApiProjectsCreate(
  app: Express,
  deps: {
    resolveUserId: (req: RequestWithUserId, res: Response, next: NextFunction) => void | Promise<void>;
    requireAuth: (req: RequestWithUserId, res: Response, next: NextFunction) => void;
  }
): void {
  const limiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: Math.max(1, parseInt(process.env.PROVISION_RATE_LIMIT_PER_HOUR ?? "5", 10)),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req as RequestWithUserId).userId ?? req.ip ?? "unknown",
    handler: (_req, res) => {
      res.status(429).json({ error: "Too many provisioning requests. Try again later." });
    },
  });

  const handler = async (req: RequestWithUserId, res: Response): Promise<void> => {
    try {
      if (!req.headers.authorization?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Bearer authentication required" });
        return;
      }
      const userId = req.userId;
      if (!userId || !UUID_RE.test(userId)) {
        res.status(401).json({ error: "Invalid or missing user session" });
        return;
      }

      const meta = await getUserMetadata(userId);
      if (!meta?.is_pro) {
        res.status(401).json({ error: "Active Pro subscription required (is_pro)" });
        return;
      }

      const pat = process.env.SUPABASE_PAT?.trim();
      const vercelTok = process.env.VERCEL_TOKEN?.trim();
      const orgSlug =
        process.env.SUPABASE_ORG_SLUG?.trim() ||
        process.env.SUPABASE_ORGANIZATION_SLUG?.trim() ||
        process.env.YOUR_ORG_ID?.trim();
      if (!pat || !vercelTok || !orgSlug) {
        console.error("[projects/create] Missing SUPABASE_PAT, VERCEL_TOKEN, or org slug env");
        res.status(503).json({ error: "Provisioning is not configured on this server" });
        return;
      }

      const body = (req.body ?? {}) as { name?: string; repoUrl?: string };
      const displayName = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Untitled";
      const cloudName = slugName(displayName);
      const repo = githubRepoFromUrl(typeof body.repoUrl === "string" ? body.repoUrl : undefined);

      const dbPass = randomDbPassword();
      let sbRef = "";
      let sbId = "";
      let vercelId = "";
      let vercelUrl: string | null = null;

      try {
        const sb = await supabaseManagementCreate(cloudName, dbPass, pat, orgSlug);
        sbRef = sb.ref;
        sbId = sb.id;
      } catch (e) {
        const st = (e as { status?: number }).status;
        if (st === 429) {
          res.status(429).json({ error: "Upstream rate limit (Supabase). Try again shortly." });
          return;
        }
        console.error("[projects/create] Supabase create failed", e);
        res.status(500).json({ error: "Failed to create Supabase project" });
        return;
      }

      try {
        const vc = await vercelCreateProject(cloudName, vercelTok, repo);
        vercelId = vc.id;
        vercelUrl = vc.url;
      } catch (e) {
        const st = (e as { status?: number }).status;
        if (st === 429) {
          res.status(429).json({ error: "Upstream rate limit (Vercel). Try again shortly." });
          return;
        }
        console.error("[projects/create] Vercel create failed", e);
        res.status(500).json({ error: "Failed to create Vercel project" });
        return;
      }

      const keys = await supabaseFetchApiKeys(sbRef, pat);
      const supabaseApiUrl = `https://${sbRef}.supabase.co`;

      const lockedSvg = await stitchLockedMockupSvg(displayName, repo);

      const row = await createProject(userId, displayName);
      if (!row) {
        console.error("[projects/create] App DB insert failed");
        res.status(500).json({ error: "Failed to save project record" });
        return;
      }

      const provisionSpecs = {
        supabase_project_ref: sbRef,
        supabase_project_id: sbId,
        supabase_api_url: supabaseApiUrl,
        supabase_anon_key_present: Boolean(keys.anon),
        supabase_service_role_present: Boolean(keys.serviceRole),
        vercel_project_id: vercelId,
        github_repo: repo,
        locked_mockup_svg: lockedSvg,
        locked_design: lockedSvg
          ? {
              v: 1 as const,
              svg: lockedSvg,
              lockedAt: new Date().toISOString(),
              source: "stitch_provision",
            }
          : undefined,
      };

      const ok = await updateProject(userId, row.id, {
        specs: JSON.stringify({ provision: provisionSpecs }),
        live_url: vercelUrl,
      });
      if (!ok) {
        console.error("[projects/create] App DB update failed", row.id);
      }

      res.status(201).json({
        success: true,
        projectId: row.id,
        supabaseUrl: supabaseApiUrl,
        vercelUrl: vercelUrl ?? undefined,
        supabaseRef: sbRef,
        vercelProjectId: vercelId,
      });
    } catch (e) {
      console.error("[projects/create]", e);
      res.status(500).json({ error: "Provisioning failed" });
    }
  };

  app.post("/api/projects/create", deps.resolveUserId, deps.requireAuth, limiter, (req, res) => {
    void handler(req as RequestWithUserId, res);
  });
}
