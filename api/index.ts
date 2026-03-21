/**
 * Single API handler for all /api/* requests (used with vercel.json rewrite).
 * Rewrite sends /api/:path* → /api?path=:path*; we set req.url for Express.
 * Open-dev-user + auth user limits/projects list + Grok (agent/chat, tts) + config audits are handled here
 * so we never load server.ts (and better-sqlite3) on Vercel for those routes.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { AGENT_SYSTEM_PROMPT } from "../src/config/agentConfig.js";
import {
  GROK_CHAT_COMPLETIONS_MODEL,
  XAI_CHAT_COMPLETIONS_URL,
  XAI_TTS_DEFAULT_LANGUAGE,
  XAI_TTS_URL,
} from "../src/config/xaiGrok.js";
import { getGrokModelAndMode, GROK_CODING_MODE_SYSTEM } from "../src/lib/grokModelSelection.js";
import { runCodeAgentPipeline, runDeployAgentPipeline } from "../src/lib/multiAgentHandlers.js";
import {
  countProjects as supabaseCountProjects,
  ensureUserAndGetMetadata,
  getGrokUsage,
  getProject as supabaseGetProject,
  isSupabaseConfigured as supabaseIsConfigured,
  listProjects as supabaseListProjects,
} from "../src/lib/supabase-multi-tenant.js";
import { buildGrokChatErrorBody } from "../src/lib/grokApiError.js";

const OPEN_DEV_PATH = "/api/users/open-dev-user/projects";
// Client Grok modal expects the error message to mention "grok".
const SERVICE_UNAVAILABLE_MSG = "Grok service unavailable—try later";
let grokFirstCallLogged = false;

function headerString(v: string | string[] | undefined): string {
  if (v === undefined || v === null) return "";
  return Array.isArray(v) ? (v[0] ?? "") : v;
}

/** Same rules as server.ts `requestFromOpenModeOrigin` (Origin / Referer only). */
function requestFromOpenModeOriginFromHeader(originOrReferer: string): boolean {
  const o = originOrReferer.trim();
  if (o) {
    try {
      const url = new URL(o);
      const host = url.hostname.toLowerCase();
      if (host === "localhost" || host === "127.0.0.1") return true;
    } catch (_) {
      /* ignore */
    }
  }
  const origin = process.env.OPEN_MODE_ORIGIN?.trim();
  if (!origin || !o) return false;
  try {
    const url = new URL(o);
    const host = url.hostname.toLowerCase();
    const want = origin.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    const wantHost = want.includes("/") ? new URL(want.startsWith("http") ? want : `https://${want}`).hostname : want;
    return host === wantHost || host === `www.${wantHost}`;
  } catch {
    return o.includes(origin) || o.includes(origin.replace(/^https?:\/\//, ""));
  }
}

async function getAuthenticatedUserId(req: VercelRequest): Promise<string | null> {
  const auth = headerString(req.headers.authorization);
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (token) {
    const url = process.env.SUPABASE_URL?.trim();
    const anon = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
    if (url && anon && url !== "PLACEHOLDER" && anon !== "PLACEHOLDER") {
      try {
        const supabase = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
        const { data, error } = await supabase.auth.getUser(token);
        if (!error && data.user?.id) return data.user.id;
      } catch {
        /* ignore */
      }
    }
  }
  const o = headerString(req.headers.origin) || headerString(req.headers.referer);
  if (requestFromOpenModeOriginFromHeader(o)) {
    return process.env.OPEN_MODE_FALLBACK_USER_ID?.trim() || "open-dev-user";
  }
  return null;
}

const freeProjectLimitEnv = () => Math.max(0, parseInt(process.env.FREE_PROJECT_LIMIT ?? "3", 10));
const freeGrokLimitEnv = () => Math.max(0, parseInt(process.env.FREE_GROK_DAILY_LIMIT ?? "10", 10));

/**
 * GET /api/users/me/limits and GET /api/users/:userId/projects without loading Express + better-sqlite3.
 * Fixes Vercel 500s when the SQLite native module or DB init fails in the serverless bundle.
 */
async function handleAuthUserApi(
  method: string,
  pathname: string,
  req: VercelRequest,
  res: VercelResponse
): Promise<boolean> {
  if (method !== "GET") return false;

  try {
    if (pathname === "/api/users/me/limits") {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return true;
      }
      const projectLimit = freeProjectLimitEnv();
      const grokLimitNum = freeGrokLimitEnv();
      let isPro = false;
      let projectCount = 0;
      let grokToday = 0;
      if (supabaseIsConfigured()) {
        const meta = await ensureUserAndGetMetadata(userId);
        isPro = meta?.is_pro ?? meta?.paid ?? false;
        projectCount = await supabaseCountProjects(userId);
        const usage = await getGrokUsage(userId);
        grokToday = usage.count;
      }
      res.status(200).json({
        isPro,
        projectCount,
        projectLimit,
        grokToday,
        grokLimit: isPro ? null : grokLimitNum,
      });
      return true;
    }

    const projectsMatch = pathname.match(/^\/api\/users\/([^/]+)\/projects$/);
    if (projectsMatch) {
      const paramUserId = projectsMatch[1];
      const userId = await getAuthenticatedUserId(req);
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return true;
      }
      if (paramUserId !== userId) {
        res.status(403).json({ error: "Forbidden: cannot access another user's data" });
        return true;
      }
      if (supabaseIsConfigured()) {
        const list = await supabaseListProjects(userId);
        res.status(200).json(
          list.map((r) => ({
            id: r.id,
            user_id: r.user_id,
            name: r.name,
            status: r.status,
            last_edited: r.last_edited,
            created_at: r.created_at,
          }))
        );
      } else {
        res.status(200).json([]);
      }
      return true;
    }
  } catch (e) {
    console.error("[api/index] handleAuthUserApi", pathname, e);
    res.status(500).json({ error: "Request failed", details: e instanceof Error ? e.message : String(e) });
    return true;
  }

  return false;
}

function getGrokApiKey(): string | null {
  const key = (process.env.XAI_API_KEY || process.env.GROK_API_KEY)?.trim();
  if (!key || key === "PLACEHOLDER") return null;
  if (!grokFirstCallLogged) {
    grokFirstCallLogged = true;
    console.log("Grok active (default: grok-4-1-fast-reasoning; coding: grok-4.20-multi-agent-0309)");
  }
  return key;
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

/** Serve /api/config so frontend gets Supabase url + anon key for OAuth (e.g. Connect GitHub). No server load. */
function handleConfig(method: string, pathname: string, res: VercelResponse): boolean {
  if (method !== "GET" || pathname !== "/api/config") return false;
  const supabaseUrl = (process.env.SUPABASE_URL ?? "").trim();
  const supabasePublishableKey = (process.env.SUPABASE_PUBLISHABLE_KEY ?? "").trim();
  const openModeFallbackUserId = (process.env.OPEN_MODE_FALLBACK_USER_ID ?? "").trim() || null;
  res.status(200).json({
    supabaseUrl: supabaseUrl && supabaseUrl !== "PLACEHOLDER" ? supabaseUrl : "",
    supabasePublishableKey:
      supabasePublishableKey && supabasePublishableKey !== "PLACEHOLDER" ? supabasePublishableKey : "",
    // Back-compat field name (derived from the same publishable key).
    supabaseAnonKey: supabasePublishableKey && supabasePublishableKey !== "PLACEHOLDER" ? supabasePublishableKey : "",
    openModeFallbackUserId,
  });
  return true;
}

function isOpenDevUserPath(pathname: string): boolean {
  return pathname === OPEN_DEV_PATH || pathname.startsWith(OPEN_DEV_PATH + "/");
}

function getProjectIdFromPath(pathname: string): string | null {
  if (!pathname.startsWith(OPEN_DEV_PATH + "/")) return null;
  const segment = pathname.slice((OPEN_DEV_PATH + "/").length);
  return segment && !segment.includes("/") ? segment : null;
}

async function handleOpenDevUser(
  method: string,
  req: VercelRequest,
  res: VercelResponse,
  pathname: string
): Promise<boolean> {
  if (!isOpenDevUserPath(pathname)) return false;

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseKey = process.env.SUPABASE_SECRET_KEY?.trim();
  const fallbackUserId = process.env.OPEN_MODE_FALLBACK_USER_ID?.trim();
  const supabaseOk = supabaseUrl && supabaseKey && supabaseUrl !== "PLACEHOLDER" && supabaseKey !== "PLACEHOLDER";

  const projectId = getProjectIdFromPath(pathname);

  // Single project: GET or PUT — on Supabase error return 404 / 200 so we never 500
  if (projectId) {
    if (method === "GET") {
      if (supabaseOk) {
        try {
          const supabase = createClient(supabaseUrl!, supabaseKey!, {
            auth: { autoRefreshToken: false, persistSession: false },
          });
          // Primary lookup: fallbackUserId-aligned user_id.
          if (fallbackUserId) {
            const { data, error } = await supabase
              .from("projects")
              .select("*")
              .eq("id", projectId)
              .eq("user_id", fallbackUserId)
              .maybeSingle();
            if (!error && data) {
              res.status(200).json(data);
              return true;
            }
            if (error) console.error("[api/index] open-dev-user GET project (by user_id)", error.message);
          }

          // Fallback lookup: allow open-mode alias mismatch by fetching by id only.
          const { data: dataById, error: errById } = await supabase
            .from("projects")
            .select("*")
            .eq("id", projectId)
            .maybeSingle();
          if (!errById && dataById) {
            res.status(200).json(dataById);
            return true;
          }
          if (errById) console.error("[api/index] open-dev-user GET project (by id)", errById.message);
        } catch (e) {
          console.error("[api/index] open-dev-user GET project", e);
        }
      }
      res.status(404).json({ error: "Project not found" });
      return true;
    }

    if (method === "PUT") {
      if (supabaseOk) {
        try {
          const body = typeof req.body === "object" && req.body ? req.body as Record<string, unknown> : {};
          const supabase = createClient(supabaseUrl!, supabaseKey!, {
            auth: { autoRefreshToken: false, persistSession: false },
          });
          const specsStr =
            body.specs === undefined
              ? undefined
              : typeof body.specs === "string"
                ? body.specs
                : JSON.stringify(body.specs ?? {});
          const lockedSummaryMd = typeof body.locked_summary_md === "string" ? body.locked_summary_md : undefined;
          const brandingAssetsStr =
            body.branding_assets === undefined
              ? undefined
              : Array.isArray(body.branding_assets)
                ? JSON.stringify(body.branding_assets)
                : typeof body.branding_assets === "string"
                  ? body.branding_assets
                  : undefined;
          const brainstormCompleteVal =
            body.brainstorm_complete === undefined
              ? undefined
              : typeof body.brainstorm_complete === "boolean"
                ? body.brainstorm_complete
                : typeof body.brainstorm_complete === "number"
                  ? body.brainstorm_complete === 1
                  : typeof body.brainstorm_complete === "string"
                    ? body.brainstorm_complete === "1"
                    : undefined;

          const updates: Record<string, unknown> = {
            last_edited: new Date().toISOString(),
            ...(lockedSummaryMd !== undefined ? { locked_summary_md: lockedSummaryMd } : {}),
            ...(brandingAssetsStr !== undefined ? { branding_assets: brandingAssetsStr } : {}),
            ...(brainstormCompleteVal !== undefined ? { brainstorm_complete: brainstormCompleteVal } : {}),
            ...(specsStr !== undefined ? { specs: specsStr } : {}),
          };
          if (typeof body.code === "string") updates.code = body.code;
          if (typeof body.package_json === "string") updates.package_json = body.package_json;
          if (Array.isArray(body.chat_messages)) updates.chat_messages = JSON.stringify(body.chat_messages);
          else if (typeof body.chat_messages === "string") updates.chat_messages = body.chat_messages;
          if (typeof body.last_edited === "string") updates.last_edited = body.last_edited;

          // Primary update: fallbackUserId-aligned user_id.
          if (fallbackUserId) {
            const { error, data } = await supabase
              .from("projects")
              .update(updates)
              .eq("id", projectId)
              .eq("user_id", fallbackUserId)
              .select("id")
              .maybeSingle();
            if (!error && data) {
              res.status(200).json({ ok: true });
              return true;
            }
            if (error) console.error("[api/index] open-dev-user PUT project (by user_id)", error.message);
          }

          // Fallback update: alias mismatch => update by id only.
          const { error: errById, data: dataById } = await supabase
            .from("projects")
            .update(updates)
            .eq("id", projectId)
            .select("id")
            .maybeSingle();
          if (!errById && dataById) {
            res.status(200).json({ ok: true });
            return true;
          }
          if (errById) console.error("[api/index] open-dev-user PUT project (by id)", errById.message);
        } catch (e) {
          console.error("[api/index] open-dev-user PUT project", e);
        }
      }
      res.status(200).json({ ok: true });
      return true;
    }

    return false;
  }

  // List (GET) — never 500: use Supabase when ok, else return []
  if (method === "GET") {
    if (supabaseOk && fallbackUserId) {
      try {
        const supabase = createClient(supabaseUrl!, supabaseKey!, { auth: { persistSession: false } });
        const { data, error } = await supabase
          .from("projects")
          .select("id, user_id, name, status, last_edited, created_at")
          .eq("user_id", fallbackUserId)
          .order("created_at", { ascending: false });
        if (!error) {
          res.status(200).json(data ?? []);
          return true;
        }
        console.error("[api/index] open-dev-user GET", error.message);
      } catch (e) {
        console.error("[api/index] open-dev-user GET", e);
      }
    }
    res.status(200).json([]);
    return true;
  }

  // Create (POST) — never 500: use Supabase when ok, else return 201 with ephemeral id
  if (method === "POST") {
    const name = (typeof req.body === "object" && req.body && "name" in req.body && typeof (req.body as { name?: unknown }).name === "string")
      ? (req.body as { name: string }).name.trim() || "New project"
      : "New project";

    if (supabaseOk && fallbackUserId) {
      try {
        const supabase = createClient(supabaseUrl!, supabaseKey!, { auth: { persistSession: false } });
        const now = new Date().toISOString();
        const { data, error } = await supabase
          .from("projects")
          .insert({
            user_id: fallbackUserId,
            name,
            status: "Draft",
            last_edited: now,
            code: defaultCode,
            package_json: defaultPackageJson,
            chat_messages: "[]",
            specs: "{}",
          })
          .select("id, user_id, name, status, last_edited, created_at")
          .single();
        if (!error && data) {
          res.status(201).json(data);
          return true;
        }
        console.error("[api/index] open-dev-user POST", error?.message ?? "no data");
      } catch (e) {
        console.error("[api/index] open-dev-user POST", e);
      }
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    res.status(201).json({
      id,
      user_id: "open-dev-user",
      name,
      status: "Draft",
      last_edited: now,
      created_at: now,
    });
    return true;
  }

  return false;
}

async function handleGrok(
  method: string,
  req: VercelRequest,
  res: VercelResponse,
  pathname: string
): Promise<boolean> {
  const apiKey = getGrokApiKey();
  const fallbackUserId = process.env.OPEN_MODE_FALLBACK_USER_ID?.trim();
  if (!apiKey) {
    if (pathname === "/api/agent/chat" || pathname === "/api/tts" || pathname === "/api/realtime/token" || pathname === "/api/images/generate") {
      console.error("[Grok] XAI_API_KEY not set — returning 503 for", pathname);
      res.status(503).json({ error: SERVICE_UNAVAILABLE_MSG });
      return true;
    }
    return false;
  }

  if (method === "POST" && pathname === "/api/realtime/token") {
    try {
      const r = await fetch("https://api.x.ai/v1/realtime/client_secrets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ expires_after: { seconds: 300 } }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        res.status(r.status).json(typeof data === "object" && data ? data : { error: "Failed to get token" });
        return true;
      }
      res.status(200).json(data);
      return true;
    } catch (e) {
      console.error("[api/index realtime token]", e);
      res.status(500).json({ error: "Failed to get voice token", details: (e instanceof Error ? e.message : String(e)) });
      return true;
    }
  }

  if (method === "POST" && pathname === "/api/agent/chat") {
    try {
      const { messages, userId: _bodyUserId, projectId: _bodyProjectId, interactionMode: _interactionMode } = (
        typeof req.body === "object" && req.body ? req.body : {}
      ) as {
        messages?: { role: string; content: string }[];
        userId?: string;
        projectId?: string;
        interactionMode?: string;
      };
      const interactionMode: "talk" | "code" | "auto" =
        _interactionMode === "code"
          ? "code"
          : _interactionMode === "talk"
            ? "talk"
            : "auto";
      if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: "messages array required" });
        return true;
      }
      const projectId = typeof _bodyProjectId === "string" ? _bodyProjectId.trim() : "";

      // Best-effort locked spec injection (Vercel serverless Grok handler).
      let lockedSpecMd = "";
      if (projectId && typeof _bodyUserId === "string" && _bodyUserId.trim()) {
        const rawUid = _bodyUserId.trim();
        // In open mode the client uses "open-dev-user", but Supabase projects use the real fallback user_id.
        const uid = rawUid === "open-dev-user" && fallbackUserId ? fallbackUserId : rawUid;
        try {
          if (supabaseIsConfigured()) {
            const p = await supabaseGetProject(uid, projectId);
            lockedSpecMd = p?.locked_summary_md ?? "";
            if (!lockedSpecMd) {
              try {
                const specsObj = JSON.parse(p?.specs ?? "{}") as Record<string, unknown>;
                lockedSpecMd = (specsObj?.__locked_summary_md as string) ?? "";
              } catch (_) {}
            }
          } else {
            try {
              const db = await import("../db");
              const p = db.getProject(uid, projectId);
              lockedSpecMd = p?.locked_summary_md ?? "";
              if (!lockedSpecMd) {
                try {
                  const specsObj = JSON.parse(p?.specs ?? "{}") as Record<string, unknown>;
                  lockedSpecMd = (specsObj?.__locked_summary_md as string) ?? "";
                } catch (_) {}
              }
            } catch (_) {
              // SQLite not available (e.g. Vercel serverless); leave lockedSpecMd empty
            }
          }
        } catch (e) {
          console.error("[api/index locked spec injection] failed", e);
        }
      }

      const systemLockedSpec =
        lockedSpecMd && lockedSpecMd.trim()
          ? `You are building the user's app. ALWAYS base your responses, code generation, and suggestions on this LOCKED SPEC as the single source of truth. Do NOT contradict or ignore it unless the user explicitly says to revise and re-lock.\n\nLocked Spec:\n\n${lockedSpecMd.trim()}`
          : null;

      const { codingMode: codingHeuristic } = getGrokModelAndMode(messages);
      let codingMode = codingHeuristic;
      if (interactionMode === "talk") codingMode = false;
      else if (interactionMode === "code") codingMode = true;
      // "auto": keep codingMode from getGrokModelAndMode(messages) only

      const grokModelEnv = process.env.GROK_MODEL?.trim();
      const model = grokModelEnv || GROK_CHAT_COMPLETIONS_MODEL;
      const body = {
        model,
        messages: [
          { role: "system", content: AGENT_SYSTEM_PROMPT },
          ...(systemLockedSpec ? [{ role: "system", content: systemLockedSpec }] : []),
          ...(codingMode ? [{ role: "system", content: GROK_CODING_MODE_SYSTEM }] : []),
          ...messages.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
        ],
        stream: false,
      };
      const response = await fetch(XAI_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      const errText = await response.text();
      if (!response.ok) {
        const body = buildGrokChatErrorBody(errText);
        console.error("[api/index Grok chat] xAI error:", response.status, body.details);
        res.status(response.status).json(body);
        return true;
      }
      // Some providers return non-JSON bodies even on HTTP 200.
      let data: { choices?: { message?: { content?: unknown } }[] } | null = null;
      try {
        data = JSON.parse(errText) as { choices?: { message?: { content?: unknown } }[] };
      } catch (e) {
        console.error("[api/index Grok chat] non-JSON success response:", e, errText.slice(0, 300));
      }
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        res.status(502).json({
          error: "Grok API returned unexpected response",
          details: errText.slice(0, 300),
        });
        return true;
      }
      res.status(200).json({ message: { role: "assistant", content } });
      return true;
    } catch (err) {
      console.error("[api/index Grok chat]", err);
      res.status(500).json({ error: "Grok chat failed", details: err instanceof Error ? err.message : String(err) });
      return true;
    }
  }

  if (method === "POST" && pathname === "/api/tts") {
    try {
      const { text, voice_id: voiceId } = (typeof req.body === "object" && req.body ? req.body : {}) as { text?: string; voice_id?: string };
      const toSpeak = typeof text === "string" ? text.trim() : "";
      if (!toSpeak || toSpeak.length > 4096) {
        res.status(400).json({ error: "text required (max 4096 chars)" });
        return true;
      }
      const response = await fetch(XAI_TTS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          text: toSpeak,
          voice_id: (voiceId && ["eve", "ara", "rex", "sal", "leo"].includes(String(voiceId).toLowerCase()))
            ? String(voiceId).toLowerCase()
            : "eve",
          language: (process.env.XAI_TTS_LANGUAGE ?? "").trim() || XAI_TTS_DEFAULT_LANGUAGE,
        }),
      });
      if (!response.ok) {
        const errText = await response.text();
        let details = errText.slice(0, 300);
        try {
          const parsed = JSON.parse(errText) as { error?: string; message?: string };
          details = parsed?.error || parsed?.message || details;
        } catch (_) {}
        res.status(response.status).json({ error: "Grok TTS failed", details });
        return true;
      }
      const audioBuffer = await response.arrayBuffer();
      res.setHeader("Content-Type", "audio/mpeg");
      res.end(Buffer.from(audioBuffer));
      return true;
    } catch (err) {
      console.error("[api/index TTS]", err);
      res.status(500).json({ error: "TTS failed", details: err instanceof Error ? err.message : String(err) });
      return true;
    }
  }

  if (method === "POST" && pathname === "/api/images/generate") {
    if (!apiKey) {
      res.status(503).json({ error: SERVICE_UNAVAILABLE_MSG });
      return true;
    }
    try {
      const { prompt } = (typeof req.body === "object" && req.body ? req.body : {}) as { prompt?: string };
      const p = typeof prompt === "string" ? prompt.trim() : "";
      if (!p) {
        res.status(400).json({ error: "prompt required" });
        return true;
      }
      const response = await fetch("https://api.x.ai/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "grok-imagine-image",
          prompt: p,
          response_format: "b64_json",
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { data?: { b64_json?: string }[]; error?: { message?: string } };
      if (!response.ok) {
        res.status(response.status).json({ error: data.error?.message ?? "Image generation failed" });
        return true;
      }
      const b64 = data.data?.[0]?.b64_json;
      if (!b64) {
        res.status(502).json({ error: "No image in response" });
        return true;
      }
      res.status(200).json({ url: `data:image/png;base64,${b64}` });
      return true;
    } catch (err) {
      console.error("[api/index image]", err);
      res.status(500).json({ error: "Image generation failed", details: err instanceof Error ? err.message : String(err) });
      return true;
    }
  }

  return false;
}

async function handleMultiAgent(
  method: string,
  pathname: string,
  req: VercelRequest,
  res: VercelResponse
): Promise<boolean> {
  if (method !== "POST") return false;
  if (pathname === "/api/agents/code-run") {
    const apiKey = getGrokApiKey();
    if (!apiKey) {
      res.status(503).json({ error: SERVICE_UNAVAILABLE_MSG });
      return true;
    }
    const body = (typeof req.body === "object" && req.body ? req.body : {}) as import("../src/lib/multiAgentHandlers.js").CodeAgentRequestBody;
    const out = await runCodeAgentPipeline(apiKey, body, process.env);
    if (out.error === "grok_failed" && typeof (out as { status?: number }).status === "number") {
      res.status((out as { status: number }).status).json(out);
      return true;
    }
    if (out.error) {
      res.status(400).json(out);
      return true;
    }
    res.status(200).json(out);
    return true;
  }
  if (pathname === "/api/agents/deploy-run") {
    const out = await runDeployAgentPipeline(process.env);
    if (out.error === "deploy_not_configured") {
      res.status(501).json(out);
      return true;
    }
    if (out.error) {
      res.status(502).json(out);
      return true;
    }
    res.status(200).json(out);
    return true;
  }
  return false;
}

let appPromise: Promise<Awaited<ReturnType<typeof import("../server").createApp>>> | null = null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const pathParam = req.query?.path;
  const pathSeg = pathParam !== undefined && pathParam !== null
    ? (Array.isArray(pathParam) ? pathParam.join("/") : String(pathParam))
    : "";
  const pathname = "/api" + (pathSeg ? `/${pathSeg}` : "");
  (req as unknown as { url: string }).url = pathname;
  console.log("[api/index]", req.method, pathname);

  if (handleConfig(req.method ?? "GET", pathname, res)) return;

  // Avoid loading Express + better-sqlite3 (server.ts) for simple probes.
  if ((req.method ?? "GET") === "GET" && pathname === "/api/health") {
    res.status(200).json({ ok: true, service: "kyn-api" });
    return;
  }

  if ((req.method ?? "GET") === "GET" && pathname === "/api/integrations/summary") {
    const { getIntegrationsSummaryJson } = await import("../src/lib/integrationsSummary.js");
    res.status(200).json(await getIntegrationsSummaryJson());
    return;
  }

  // Secrets audit — must not fall through to Express+SQLite on Vercel.
  if ((req.method ?? "GET") === "GET" && pathname === "/api/config/secrets-audit") {
    const { buildSecretsAuditPayload } = await import("../src/lib/secretsAuditPayload.js");
    res.status(200).json(buildSecretsAuditPayload());
    return;
  }
  if ((req.method ?? "GET") === "GET" && pathname === "/api/config/production-readiness") {
    const { buildProductionReadinessPayload } = await import("../src/lib/secretsAuditPayload.js");
    res.status(200).json(buildProductionReadinessPayload());
    return;
  }
  if ((req.method ?? "POST") === "POST" && pathname === "/api/config/secrets-alignment") {
    const { buildSecretsAlignmentPayload } = await import("../src/lib/secretsAuditPayload.js");
    const body =
      typeof req.body === "object" && req.body
        ? (req.body as { browserSecrets?: Record<string, boolean> })
        : {};
    const browser = body.browserSecrets ?? {};
    res.status(200).json(buildSecretsAlignmentPayload(browser));
    return;
  }

  const handled = await handleOpenDevUser(req.method ?? "GET", req, res, pathname);
  if (handled) return;

  const authUserHandled = await handleAuthUserApi(req.method ?? "GET", pathname, req, res);
  if (authUserHandled) return;

  const agentHandled = await handleMultiAgent(req.method ?? "GET", pathname, req, res);
  if (agentHandled) return;

  const grokHandled = await handleGrok(req.method ?? "GET", req, res, pathname);
  if (grokHandled) return;

  const { createApp } = await import("../server");
  if (!appPromise) appPromise = createApp();
  const app = await appPromise;
  return app(req, res);
}
