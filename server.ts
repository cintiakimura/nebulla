import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import { createServer as createViteServer } from "vite";
import { createCheckoutSession } from "./src/api/create-checkout-session.js";
import { handleStripeWebhook } from "./src/api/stripe-webhook.js";
import { handleExportProject } from "./src/api/export-project.js";
import { cancelSubscription } from "./src/api/cancel-subscription.js";
import { createBillingPortalSession } from "./src/api/billing-portal.js";
import { AGENT_ID, AGENT_SYSTEM_PROMPT, AGENT_PRE_CODE_QUESTIONS } from "./src/config/agentConfig.js";
import * as db from "./db.js";
import {
  isSupabaseConfigured,
  listProjects as supabaseListProjects,
  countProjects as supabaseCountProjects,
  getProject as supabaseGetProject,
  createProject as supabaseCreateProject,
  updateProject as supabaseUpdateProject,
  ensureUserAndGetMetadata,
  getGrokUsage,
  incrementGrokCalls,
} from "./src/lib/supabase-multi-tenant.js";

type RequestWithUserId = express.Request & { userId?: string };

async function resolveUserId(req: RequestWithUserId, res: express.Response, next: express.NextFunction): Promise<void> {
  const auth = req.headers.authorization;
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (token) {
    const url = process.env.SUPABASE_URL?.trim();
    const anon = process.env.SUPABASE_ANON_KEY?.trim();
    if (url && anon && url !== "PLACEHOLDER" && anon !== "PLACEHOLDER") {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(url, anon);
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (!error && user?.id) {
          req.userId = user.id;
        }
      } catch (_) {}
    }
  }
  // Do NOT fall back to req.params.userId — unauthenticated callers must not access other users' data
  next();
}

function requireAuth(req: RequestWithUserId, res: express.Response, next: express.NextFunction): void {
  if (!req.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

/** Require that authenticated user matches :userId param (prevents accessing other users' data). Use after resolveUserId + requireAuth. */
function requireMatchUserId(req: RequestWithUserId, res: express.Response, next: express.NextFunction): void {
  const paramUserId = req.params.userId;
  if (paramUserId != null && paramUserId !== req.userId) {
    res.status(403).json({ error: "Forbidden: cannot access another user's data" });
    return;
  }
  next();
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Stripe webhook must get raw body (before express.json())
  app.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      (req as unknown as { rawBody?: Buffer }).rawBody = req.body as Buffer;
      next();
    },
    handleStripeWebhook
  );

  app.use(express.json());

  // Health check (for wizard + load-time checks). No auth required.
  app.get("/api/health", (_req, res) => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    const supabaseConnected = !!(
      typeof supabaseUrl === "string" &&
      supabaseUrl.trim() &&
      supabaseUrl !== "PLACEHOLDER" &&
      typeof supabaseKey === "string" &&
      supabaseKey.trim() &&
      supabaseKey !== "PLACEHOLDER"
    );
    res.json({
      status: "ok",
      supabaseConnected,
      version: process.env.npm_package_version ?? "0.1.0",
    });
  });

  // CORS: when frontend is on another host (e.g. Vercel), set ALLOWED_ORIGIN to that URL
  const allowedOrigin = process.env.ALLOWED_ORIGIN;
  if (allowedOrigin) {
    app.use((req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      if (req.method === "OPTIONS") return res.sendStatus(204);
      next();
    });
  }

  // Public config: Supabase anon key for frontend (no auth)
  app.get("/api/config", (_req, res) => {
    const supabaseUrl = process.env.SUPABASE_URL?.trim() ?? "";
    const supabaseAnon = process.env.SUPABASE_ANON_KEY?.trim() ?? "";
    const introPriceId = process.env.STRIPE_INTRO_PRICE_ID?.trim();
    res.json({
      supabaseUrl: supabaseUrl && supabaseUrl !== "PLACEHOLDER" ? supabaseUrl : "",
      supabaseAnonKey: supabaseAnon && supabaseAnon !== "PLACEHOLDER" ? supabaseAnon : "",
      introPriceAvailable: !!(introPriceId && introPriceId !== "PLACEHOLDER"),
    });
  });

  // Session: return or create a userId (mock auth; client stores it)
  app.post("/api/auth/session", (req, res) => {
    const { userId: existing } = req.body as { userId?: string };
    const userId = existing && typeof existing === "string" && existing.length > 0 ? existing : crypto.randomUUID();
    res.json({ userId });
  });

  // Projects: list (Supabase when configured, else SQLite). Auth required; param userId must match token.
  app.get("/api/users/:userId/projects", resolveUserId, requireAuth, requireMatchUserId, async (req, res) => {
    try {
      const userId = (req as RequestWithUserId).userId!;
      if (isSupabaseConfigured()) {
        const list = await supabaseListProjects(userId);
        res.json(list.map((r) => ({ id: r.id, user_id: r.user_id, name: r.name, status: r.status, last_edited: r.last_edited, created_at: r.created_at })));
        return;
      }
      const list = db.listProjects(userId);
      res.json(list);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to list projects" });
    }
  });

  // Free-tier limits (project limit for display). Legacy: /api/users/:userId/limits
  const freeProjectLimit = () => Math.max(0, parseInt(process.env.FREE_PROJECT_LIMIT ?? "3", 10));
  const freeGrokLimit = () => Math.max(0, parseInt(process.env.FREE_GROK_DAILY_LIMIT ?? "10", 10));

  // /api/users/me/limits — auth required (Bearer). Returns { isPro, projectCount, grokToday, grokLimit, paidUntil }.
  app.get("/api/users/me/limits", resolveUserId, requireAuth, async (req, res) => {
    const userId = (req as RequestWithUserId).userId!;
    const projectLimit = freeProjectLimit();
    const grokLimitNum = freeGrokLimit();
    let isPro = false;
    let projectCount = 0;
    let grokToday = 0;
    let paidUntil: string | null = null;
    if (isSupabaseConfigured()) {
      const meta = await ensureUserAndGetMetadata(userId);
      isPro = meta?.is_pro ?? meta?.paid ?? false;
      paidUntil = meta?.paid_until ?? null;
      projectCount = await supabaseCountProjects(userId);
      const usage = await getGrokUsage(userId);
      grokToday = usage.count;
    } else {
      projectCount = db.countProjects(userId);
    }
    const isExpired = paidUntil != null && new Date(paidUntil) <= new Date();
    const hasAccess = !isExpired && (isPro || (paidUntil != null && new Date(paidUntil) > new Date()));
    res.json({
      isPro: hasAccess,
      projectCount,
      projectLimit,
      grokToday,
      grokLimit: hasAccess ? null : grokLimitNum,
      paidUntil: paidUntil ?? undefined,
    });
  });

  app.get("/api/users/:userId/limits", resolveUserId, requireAuth, requireMatchUserId, async (req, res) => {
    const userId = (req as RequestWithUserId).userId!;
    const projectLimit = freeProjectLimit();
    const grokLimitNum = freeGrokLimit();
    let isPro = false;
    let projectCount = 0;
    let grokToday = 0;
    let paidUntil: string | null = null;
    if (userId && isSupabaseConfigured()) {
      const meta = await ensureUserAndGetMetadata(userId);
      isPro = meta?.is_pro ?? meta?.paid ?? false;
      paidUntil = meta?.paid_until ?? null;
      projectCount = await supabaseCountProjects(userId);
      const usage = await getGrokUsage(userId);
      grokToday = usage.count;
    } else if (userId) {
      projectCount = db.countProjects(userId);
    }
    const isExpired = paidUntil != null && new Date(paidUntil) <= new Date();
    const hasAccess = !isExpired && (isPro || (paidUntil != null && new Date(paidUntil) > new Date()));
    res.json({
      projectLimit,
      grokLimit: hasAccess ? null : grokLimitNum,
      isPro: hasAccess,
      projectCount,
      grokToday,
      paidUntil: paidUntil ?? undefined,
    });
  });

  /** True if user has write access (Pro or paid_until in future). Expired (paid_until in the past) returns false even if is_pro is still set. */
  async function hasWriteAccess(userId: string): Promise<boolean> {
    if (!isSupabaseConfigured()) return true;
    const meta = await ensureUserAndGetMetadata(userId);
    const isPro = meta?.is_pro ?? meta?.paid ?? false;
    const paidUntil = meta?.paid_until ?? null;
    if (paidUntil != null && new Date(paidUntil) <= new Date()) return false;
    return isPro || (paidUntil != null && new Date(paidUntil) > new Date());
  }

  // Projects: create (enforce free-tier project limit). Auth required; param userId must match token.
  app.post("/api/users/:userId/projects", resolveUserId, requireAuth, requireMatchUserId, async (req, res) => {
    try {
      const userId = (req as RequestWithUserId).userId!;
      const canWrite = await hasWriteAccess(userId);
      if (!canWrite) {
        res.status(403).json({
          error: "read_only_expired",
          message: "Subscription expired. You're in read-only mode. Upgrade to create new projects.",
        });
        return;
      }
      const { name } = req.body as { name?: string };
      const limit = freeProjectLimit();
      const count = isSupabaseConfigured() ? await supabaseCountProjects(userId) : db.countProjects(userId);
      let isPaid = true;
      if (isSupabaseConfigured()) {
        const meta = await ensureUserAndGetMetadata(userId);
        isPaid = meta?.is_pro ?? meta?.paid ?? false;
      } else {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (supabaseUrl && supabaseKey && supabaseUrl !== "PLACEHOLDER" && supabaseKey !== "PLACEHOLDER") {
          try {
            const { createClient } = await import("@supabase/supabase-js");
            const supabase = createClient(supabaseUrl, supabaseKey);
            const { data: row } = await supabase.from("users").select("paid, is_pro").eq("id", userId).maybeSingle();
            isPaid = row?.paid === true || row?.is_pro === true;
          } catch (_) {}
        }
      }
      if (!isPaid && count >= limit) {
        res.status(403).json({ error: "free_project_limit_reached", limit });
        return;
      }
      if (isSupabaseConfigured()) {
        const project = await supabaseCreateProject(userId, name ?? "Untitled");
        if (!project) {
          res.status(500).json({ error: "Failed to create project" });
          return;
        }
        res.status(201).json({
          id: project.id,
          user_id: project.user_id,
          name: project.name,
          status: project.status,
          last_edited: project.last_edited,
          created_at: project.created_at,
        });
        return;
      }
      const project = db.createProject(userId, name ?? "Untitled");
      res.status(201).json(project);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to create project" });
    }
  });

  // Projects: get one (full code + chat). Auth required; param userId must match token.
  app.get("/api/users/:userId/projects/:projectId", resolveUserId, requireAuth, requireMatchUserId, async (req, res) => {
    try {
      const userId = (req as RequestWithUserId).userId!;
      const { projectId } = req.params;
      if (isSupabaseConfigured()) {
        const project = await supabaseGetProject(userId, projectId);
        if (!project) {
          res.status(404).json({ error: "Project not found" });
          return;
        }
        res.json(project);
        return;
      }
      const project = db.getProject(userId, projectId);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      res.json(project);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to get project" });
    }
  });

  // Projects: update (code, packageJson, chatMessages, name, status, last_edited, specs). Auth required; param userId must match token.
  app.put("/api/users/:userId/projects/:projectId", resolveUserId, requireAuth, requireMatchUserId, async (req, res) => {
    try {
      const userId = (req as RequestWithUserId).userId!;
      const { projectId } = req.params;
      const { code, package_json, chat_messages, name, status, last_edited, specs } = req.body as {
        code?: string;
        package_json?: string;
        chat_messages?: string;
        name?: string;
        status?: string;
        last_edited?: string;
        specs?: string | Record<string, string>;
      };
      const specsStr = specs === undefined ? undefined : typeof specs === "string" ? specs : JSON.stringify(specs);
      const updates = {
        code,
        package_json,
        chat_messages: typeof chat_messages === "string" ? chat_messages : JSON.stringify(chat_messages ?? []),
        name,
        status,
        last_edited,
        specs: specsStr,
      };
      if (isSupabaseConfigured()) {
        const ok = await supabaseUpdateProject(userId, projectId, updates);
        if (!ok) {
          res.status(404).json({ error: "Project not found" });
          return;
        }
        res.json({ ok: true });
        return;
      }
      const ok = db.updateProject(userId, projectId, updates);
      if (!ok) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to update project" });
    }
  });

  // Export project as zip (auth required)
  app.get("/api/export/:id", resolveUserId, requireAuth, handleExportProject);

  // /api/projects — REST scoped by auth (Bearer). Free tier: 3 projects.
  app.get("/api/projects", resolveUserId, requireAuth, async (req, res) => {
    try {
      const userId = (req as RequestWithUserId).userId!;
      if (isSupabaseConfigured()) {
        const list = await supabaseListProjects(userId);
        res.json(list.map((r) => ({ id: r.id, user_id: r.user_id, name: r.name, status: r.status, last_edited: r.last_edited, created_at: r.created_at })));
        return;
      }
      const list = db.listProjects(userId);
      res.json(list);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to list projects" });
    }
  });

  app.post("/api/projects", resolveUserId, requireAuth, async (req, res) => {
    try {
      const userId = (req as RequestWithUserId).userId!;
      const canWrite = await hasWriteAccess(userId);
      if (!canWrite) {
        res.status(403).json({
          error: "read_only_expired",
          message: "Subscription expired. You're in read-only mode. Upgrade to create new projects.",
        });
        return;
      }
      const { name } = req.body as { name?: string };
      const limit = freeProjectLimit();
      const count = isSupabaseConfigured() ? await supabaseCountProjects(userId) : db.countProjects(userId);
      let isPaid = false;
      if (isSupabaseConfigured()) {
        const meta = await ensureUserAndGetMetadata(userId);
        isPaid = meta?.is_pro ?? meta?.paid ?? false;
      } else {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (supabaseUrl && supabaseKey && supabaseUrl !== "PLACEHOLDER" && supabaseKey !== "PLACEHOLDER") {
          try {
            const { createClient } = await import("@supabase/supabase-js");
            const supabase = createClient(supabaseUrl, supabaseKey);
            const { data: row } = await supabase.from("users").select("paid, is_pro").eq("id", userId).maybeSingle();
            isPaid = row?.paid === true || row?.is_pro === true;
          } catch (_) {}
        }
      }
      if (!isPaid && count >= limit) {
        res.status(403).json({ error: "free_project_limit_reached", limit });
        return;
      }
      if (isSupabaseConfigured()) {
        const project = await supabaseCreateProject(userId, name ?? "Untitled");
        if (!project) {
          res.status(500).json({ error: "Failed to create project" });
          return;
        }
        res.status(201).json({
          id: project.id,
          user_id: project.user_id,
          name: project.name,
          status: project.status,
          last_edited: project.last_edited,
          created_at: project.created_at,
        });
        return;
      }
      const project = db.createProject(userId, name ?? "Untitled");
      res.status(201).json(project);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to create project" });
    }
  });

  app.get("/api/projects/:projectId", resolveUserId, requireAuth, async (req, res) => {
    try {
      const userId = (req as RequestWithUserId).userId!;
      const { projectId } = req.params;
      if (isSupabaseConfigured()) {
        const project = await supabaseGetProject(userId, projectId);
        if (!project) {
          res.status(404).json({ error: "Project not found" });
          return;
        }
        res.json(project);
        return;
      }
      const project = db.getProject(userId, projectId);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      res.json(project);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to get project" });
    }
  });

  app.put("/api/projects/:projectId", resolveUserId, requireAuth, async (req, res) => {
    try {
      const userId = (req as RequestWithUserId).userId!;
      const { projectId } = req.params;
      const { code, package_json, chat_messages, name, status, last_edited, specs } = req.body as {
        code?: string;
        package_json?: string;
        chat_messages?: string;
        name?: string;
        status?: string;
        last_edited?: string;
        specs?: string | Record<string, string>;
      };
      const specsStr = specs === undefined ? undefined : typeof specs === "string" ? specs : JSON.stringify(specs);
      const updates = {
        code,
        package_json,
        chat_messages: typeof chat_messages === "string" ? chat_messages : JSON.stringify(chat_messages ?? []),
        name,
        status,
        last_edited,
        specs: specsStr,
      };
      if (isSupabaseConfigured()) {
        const ok = await supabaseUpdateProject(userId, projectId, updates);
        if (!ok) {
          res.status(404).json({ error: "Project not found" });
          return;
        }
        res.json({ ok: true });
        return;
      }
      const ok = db.updateProject(userId, projectId, updates);
      if (!ok) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to update project" });
    }
  });

  // Agent config — core engine for Grok/Eve (only model used in this builder)
  app.get("/api/agent/config", (_req, res) => {
    res.json({
      agentId: AGENT_ID,
      systemPrompt: AGENT_SYSTEM_PROMPT,
      preCodeQuestions: [...AGENT_PRE_CODE_QUESTIONS],
    });
  });

  // Chat with Grok only — no other LLM. Rate-limit free users (grok_calls_today in Supabase). Read-only if access expired.
  const agentChatLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: "rate_limit_exceeded", message: "Too many requests. Try again in a minute." },
    standardHeaders: true,
  });
  app.post("/api/agent/chat", agentChatLimiter, resolveUserId, async (req, res) => {
    const apiKey = process.env.GROK_API_KEY;
    if (!apiKey || apiKey === "PLACEHOLDER") {
      res.status(503).json({ error: "Grok API key not configured. Add GROK_API_KEY to .env (get key at console.x.ai)." });
      return;
    }
    try {
      const { messages, userId: bodyUserId } = req.body as { messages?: { role: string; content: string }[]; userId?: string };
      const authUserId = (req as RequestWithUserId).userId;
      if (isSupabaseConfigured() && !authUserId) {
        res.status(401).json({ error: "Unauthorized. Sign in to use Grok." });
        return;
      }
      const userId = authUserId ?? bodyUserId;
      if (userId && isSupabaseConfigured()) {
        const meta = await ensureUserAndGetMetadata(userId);
        const paidUntil = meta?.paid_until ?? null;
        const isExpired = paidUntil != null && new Date(paidUntil) <= new Date();
        if (isExpired) {
          res.status(403).json({
            error: "read_only_expired",
            message: "Subscription expired. You're in read-only mode. Upgrade to continue chatting.",
          });
          return;
        }
        const isPro = meta?.is_pro ?? meta?.paid ?? false;
        const hasUnlimitedGrok = isPro || (paidUntil != null && new Date(paidUntil) > new Date());
        if (!hasUnlimitedGrok) {
          const { count } = await getGrokUsage(userId);
          const limit = Math.max(0, parseInt(process.env.FREE_GROK_DAILY_LIMIT ?? "10", 10));
          if (count >= limit) {
            res.status(429).json({
              error: "free_grok_limit_reached",
              limit,
              message: `Free tier: ${limit} Grok chats per day. Upgrade to Pro for unlimited.`,
            });
            return;
          }
        }
      }
      if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: "messages array required" });
        return;
      }
      // Grok 4.1 Fast (xAI primary model name; override with GROK_MODEL env)
      const model = (process.env.GROK_MODEL || "grok-4-1-fast").trim();
      const body = {
        model,
        messages: [
          { role: "system", content: AGENT_SYSTEM_PROMPT },
          ...messages.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
        ],
        stream: false,
      };
      const response = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      const errText = await response.text();
      if (!response.ok) {
        let details: string;
        try {
          const parsed = JSON.parse(errText) as { error?: { message?: string } };
          details = parsed?.error?.message || errText.slice(0, 300);
        } catch {
          details = errText.slice(0, 300);
        }
        console.error("[Grok chat] xAI error:", response.status, details);
        res.status(response.status).json({ error: "Grok API error", details });
        return;
      }
      if (userId && isSupabaseConfigured()) {
        const meta = await ensureUserAndGetMetadata(userId);
        const paidUntil = meta?.paid_until ?? null;
        const isExpired = paidUntil != null && new Date(paidUntil) <= new Date();
        const isPro = meta?.is_pro ?? meta?.paid ?? false;
        const hasUnlimitedGrok = !isExpired && (isPro || (paidUntil != null && new Date(paidUntil) > new Date()));
        if (!hasUnlimitedGrok) await incrementGrokCalls(userId);
      }
      const data = JSON.parse(errText) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content ?? "";
      res.json({ message: { role: "assistant", content } });
    } catch (err) {
      console.error("[Grok chat]", err);
      res.status(500).json({ error: "Grok chat failed", details: err instanceof Error ? err.message : String(err) });
    }
  });

  // Grok voice (xAI TTS, voice Eve) — natural speech for onboarding and "Grok speaks" in Builder
  app.post("/api/tts", async (req, res) => {
    const apiKey = process.env.GROK_API_KEY;
    if (!apiKey || apiKey === "PLACEHOLDER") {
      res.status(503).json({ error: "Grok API key required for voice. Add GROK_API_KEY to .env." });
      return;
    }
    try {
      const { text, voice_id: voiceId } = req.body as { text?: string; voice_id?: string };
      const toSpeak = typeof text === "string" ? text.trim() : "";
      if (!toSpeak || toSpeak.length > 4096) {
        res.status(400).json({ error: "text required (max 4096 chars)" });
        return;
      }
      const response = await fetch("https://api.x.ai/v1/tts", {
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
        return;
      }
      const audioBuffer = await response.arrayBuffer();
      res.setHeader("Content-Type", "audio/mpeg");
      res.send(Buffer.from(audioBuffer));
    } catch (err) {
      console.error("[TTS]", err);
      res.status(500).json({ error: "TTS failed", details: err instanceof Error ? err.message : String(err) });
    }
  });

  // Builder.io Visual Copilot: generate UI/design code from prompt (key never exposed client-side)
  const BUILDER_FREE_DAILY_LIMIT = Math.max(0, parseInt(process.env.BUILDER_GENERATION_FREE_DAILY_LIMIT ?? "10", 10));
  const builderGenCountByUser = new Map<string, { date: string; count: number }>();

  function getBuilderGenUsage(userId: string): { date: string; count: number } {
    const today = new Date().toISOString().slice(0, 10);
    const cur = builderGenCountByUser.get(userId);
    if (!cur || cur.date !== today) return { date: today, count: 0 };
    return cur;
  }

  function incrementBuilderGenUsage(userId: string): void {
    const today = new Date().toISOString().slice(0, 10);
    const cur = builderGenCountByUser.get(userId);
    if (!cur || cur.date !== today) {
      builderGenCountByUser.set(userId, { date: today, count: 1 });
      return;
    }
    cur.count++;
    builderGenCountByUser.set(userId, cur);
  }

  app.post("/api/builder/generate", async (req, res) => {
    try {
      const { prompt, userId } = req.body as { prompt?: string; userId?: string };
      if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
        res.status(400).json({ error: "prompt is required" });
        return;
      }
      const uid = typeof userId === "string" ? userId : "";
      const apiKey = (process.env.BUILDER_PRIVATE_KEY || "").trim();
      if (!apiKey || apiKey === "PLACEHOLDER") {
        res.status(503).json({
          error: "Builder.io not configured. Add BUILDER_PRIVATE_KEY to .env (Builder.io dashboard → API keys).",
          placeholder: true,
        });
        return;
      }
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
      let isPaid = false;
      if (supabaseUrl && supabaseKey && uid && supabaseUrl !== "PLACEHOLDER" && supabaseKey !== "PLACEHOLDER") {
        try {
          const { createClient } = await import("@supabase/supabase-js");
          const supabase = createClient(supabaseUrl, supabaseKey);
          const { data: row } = await supabase.from("users").select("paid, is_pro, paid_until").eq("id", uid).maybeSingle();
          const paidOrPro = row?.paid === true || row?.is_pro === true;
          const paidUntil = row?.paid_until ?? null;
          const isExpired = paidUntil != null && new Date(paidUntil) <= new Date();
          isPaid = paidOrPro && !isExpired;
        } catch (_) {}
      }
      if (!isPaid && uid) {
        const usage = getBuilderGenUsage(uid);
        if (usage.count >= BUILDER_FREE_DAILY_LIMIT) {
          res.status(429).json({
            error: `Rate limit – try later or upgrade. Free tier: ${BUILDER_FREE_DAILY_LIMIT} UI generations per day.`,
          });
          return;
        }
      }
      const response = await fetch("https://api.builder.io/v1/ai/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      const errText = await response.text();
      if (!response.ok) {
        let msg = errText.slice(0, 300);
        try {
          const parsed = JSON.parse(errText) as { error?: string; message?: string };
          msg = parsed?.error || parsed?.message || msg;
        } catch (_) {}
        if (response.status === 401) {
          res.status(503).json({
            error: "Builder.io not configured. Add BUILDER_PRIVATE_KEY to .env (Builder.io dashboard → API keys).",
            placeholder: true,
          });
          return;
        }
        if (response.status === 404) {
          res.status(503).json({
            error: "Builder.io not configured or endpoint unavailable.",
            placeholder: true,
          });
          return;
        }
        if (response.status === 429) {
          res.status(429).json({ error: "Rate limit – try later or upgrade" });
          return;
        }
        res.status(503).json({ error: msg || "Builder.io service unavailable" });
        return;
      }
      if (!isPaid && uid) incrementBuilderGenUsage(uid);
      let data: { code?: string; output?: string; component?: string };
      try {
        data = JSON.parse(errText) as { code?: string; output?: string; component?: string };
      } catch (_) {
        res.status(500).json({ error: "Invalid response from Builder.io" });
        return;
      }
      const code = data?.code ?? data?.output ?? data?.component ?? "";
      res.json({ code: code || "", raw: data });
    } catch (err) {
      console.error("[builder generate]", err);
      res.status(500).json({ error: "UI code generation failed", details: err instanceof Error ? err.message : String(err) });
    }
  });

  // API routes
  app.post("/api/deploy", async (req, res) => {
    try {
      if (!process.env.FIREBASE_PROJECT_ID || !process.env.GITHUB_CLIENT_ID) {
        console.log("Add FIREBASE_PROJECT_ID and GITHUB_CLIENT_ID to .env");
      }
      // Mock Firebase/GitHub deploy
      console.log(`[Mock] Deploying project...`);
      res.json({ status: "success", message: "Deployed to GitHub/Firebase successfully (Mock)" });
    } catch (error) {
      res.status(500).json({ error: "Deploy failed" });
    }
  });

  // Stripe Checkout — see src/api/create-checkout-session.ts (env: STRIPE_SECRET_KEY, STRIPE_*_PRICE_ID)
  app.post("/api/create-checkout-session", createCheckoutSession);
  app.post("/api/cancel-subscription", resolveUserId, requireAuth, cancelSubscription);
  app.post("/api/billing-portal", resolveUserId, requireAuth, createBillingPortalSession);

  // After Stripe success: client sends plan + userId → update Supabase user paid=true, is_pro, plan
  app.post("/api/update-paid-status", async (req, res) => {
    const { plan, userId } = req.body as { plan?: string; userId?: string };
    if (!userId || typeof userId !== "string") {
      res.status(400).json({ error: "body: { plan, userId } required" });
      return;
    }
    const planVal = plan === "king_pro" || plan === "pro" ? "pro" : plan === "intro" ? "intro" : plan === "prototype" ? "prototype" : null;
    if (planVal === null) {
      res.status(400).json({ error: "plan must be 'pro', 'intro', or 'prototype'" });
      return;
    }
    const isPro = planVal === "pro" || planVal === "intro";
    if (isSupabaseConfigured()) {
      const { setUserPro } = await import("./src/lib/supabase-multi-tenant.js");
      const ok = await setUserPro(userId, isPro, undefined, undefined, undefined, isPro ? planVal : undefined);
      if (!ok) {
        res.status(503).json({ error: "Failed to update user" });
        return;
      }
      res.json({ ok: true });
      return;
    }
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey || supabaseUrl === "PLACEHOLDER" || supabaseKey === "PLACEHOLDER") {
      res.status(503).json({ error: "Supabase not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY to .env" });
      return;
    }
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { error } = await supabase
        .from("users")
        .upsert({ id: userId, paid: true, is_pro: isPro, plan: planVal }, { onConflict: "id" });
      if (error) {
        console.error("[update-paid-status]", error);
        res.status(503).json({ error: "Supabase update failed" });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      console.error("[update-paid-status]", err);
      res.status(503).json({ error: "Supabase not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY to .env" });
    }
  });

  app.post("/api/stripe/checkout", async (req, res) => {
    try {
      if (!process.env.STRIPE_SECRET_KEY) {
        console.log("Add STRIPE_SECRET_KEY to .env");
      }
      // Mock Stripe checkout session creation
      console.log(`[Mock] Creating Stripe checkout session...`);
      res.json({ status: "success", url: "https://checkout.stripe.com/mock" });
    } catch (error) {
      res.status(500).json({ error: "Checkout failed" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    const grokKey = process.env.GROK_API_KEY;
    if (!grokKey || grokKey === "PLACEHOLDER") {
      console.log("Grok: GROK_API_KEY not set — chat will return 503. Add it to .env (get key at console.x.ai).");
    } else {
      console.log("Grok: API key loaded — chat is enabled.");
    }
  });
}

startServer();
