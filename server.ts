import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import { createCheckoutSession } from "./src/api/create-checkout-session";
import { AGENT_ID, AGENT_SYSTEM_PROMPT, AGENT_PRE_CODE_QUESTIONS } from "./src/config/agentConfig";
import * as db from "./db.js";

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // CORS: when frontend is on another host (e.g. Vercel), set ALLOWED_ORIGIN to that URL
  const allowedOrigin = process.env.ALLOWED_ORIGIN;
  if (allowedOrigin) {
    app.use((req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      if (req.method === "OPTIONS") return res.sendStatus(204);
      next();
    });
  }

  // Session: return or create a userId (mock auth; client stores it)
  app.post("/api/auth/session", (req, res) => {
    const { userId: existing } = req.body as { userId?: string };
    const userId = existing && typeof existing === "string" && existing.length > 0 ? existing : crypto.randomUUID();
    res.json({ userId });
  });

  // Projects: list
  app.get("/api/users/:userId/projects", (req, res) => {
    try {
      const { userId } = req.params;
      const list = db.listProjects(userId);
      res.json(list);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to list projects" });
    }
  });

  // Free-tier limits (project limit for display)
  const freeProjectLimit = () => Math.max(0, parseInt(process.env.FREE_PROJECT_LIMIT ?? "3", 10));
  app.get("/api/users/:userId/limits", (_req, res) => {
    res.json({ projectLimit: freeProjectLimit() });
  });

  // Projects: create (enforce free-tier project limit)
  app.post("/api/users/:userId/projects", async (req, res) => {
    try {
      const { userId } = req.params;
      const { name } = req.body as { name?: string };
      const limit = freeProjectLimit();
      const count = db.countProjects(userId);
      let isPaid = true;
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (supabaseUrl && supabaseKey && supabaseUrl !== "PLACEHOLDER" && supabaseKey !== "PLACEHOLDER") {
        try {
          const { createClient } = await import("@supabase/supabase-js");
          const supabase = createClient(supabaseUrl, supabaseKey);
          const { data: row } = await supabase.from("users").select("paid").eq("id", userId).maybeSingle();
          isPaid = row?.paid === true;
        } catch (_) {
          // If Supabase fails, allow create (fail open)
        }
      }
      if (!isPaid && count >= limit) {
        res.status(403).json({ error: "free_project_limit_reached", limit });
        return;
      }
      const project = db.createProject(userId, name ?? "Untitled");
      res.status(201).json(project);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to create project" });
    }
  });

  // Projects: get one (full code + chat)
  app.get("/api/users/:userId/projects/:projectId", (req, res) => {
    try {
      const { userId, projectId } = req.params;
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

  // Projects: update (code, packageJson, chatMessages, name, status, last_edited)
  app.put("/api/users/:userId/projects/:projectId", (req, res) => {
    try {
      const { userId, projectId } = req.params;
      const { code, package_json, chat_messages, name, status, last_edited } = req.body as {
        code?: string;
        package_json?: string;
        chat_messages?: string;
        name?: string;
        status?: string;
        last_edited?: string;
      };
      const ok = db.updateProject(userId, projectId, {
        code,
        package_json,
        chat_messages: typeof chat_messages === "string" ? chat_messages : JSON.stringify(chat_messages ?? []),
        name,
        status,
        last_edited,
      });
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

  // Chat with Grok only — no other LLM
  app.post("/api/agent/chat", async (req, res) => {
    const apiKey = process.env.GROK_API_KEY;
    if (!apiKey || apiKey === "PLACEHOLDER") {
      res.status(503).json({ error: "Grok API key not configured. Add GROK_API_KEY to .env (get key at console.x.ai)." });
      return;
    }
    try {
      const { messages } = req.body as { messages: { role: string; content: string }[] };
      if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: "messages array required" });
        return;
      }
      // Grok 4.1 reasoning mode (chain-of-thought, deeper analysis). Override with GROK_MODEL if needed.
      const model = (process.env.GROK_MODEL || "grok-4-1-fast-reasoning").trim();
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
          const { data: row } = await supabase.from("users").select("paid").eq("id", uid).maybeSingle();
          isPaid = row?.paid === true;
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
          res.status(401).json({ error: "Invalid Builder.io API key" });
          return;
        }
        if (response.status === 429) {
          res.status(429).json({ error: "Rate limit – try later or upgrade" });
          return;
        }
        res.status(response.status).json({ error: msg });
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

  // After Stripe success: client sends plan + userId → update Supabase user paid=true, plan=...
  app.post("/api/update-paid-status", async (req, res) => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey || supabaseUrl === "PLACEHOLDER" || supabaseKey === "PLACEHOLDER") {
      res.status(503).json({ error: "Supabase not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY to .env" });
      return;
    }
    const { plan, userId } = req.body as { plan?: string; userId?: string };
    if (
      !userId ||
      typeof userId !== "string" ||
      (plan !== "prototype" && plan !== "king_pro")
    ) {
      res.status(400).json({ error: "body: { plan: 'prototype'|'king_pro', userId } required" });
      return;
    }
    const planVal = plan === "king_pro" ? "king_pro" : "prototype";
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { error } = await supabase
        .from("users")
        .upsert({ id: userId, paid: true, plan: planVal }, { onConflict: "id" });
      if (error) {
        console.error("[update-paid-status]", error);
        res.status(500).json({ error: "Failed to update paid status" });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      console.error("[update-paid-status]", err);
      res.status(500).json({ error: "Update paid status failed" });
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
