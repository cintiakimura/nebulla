import express from "express";
import { createServer as createViteServer } from "vite";
import { AGENT_ID, AGENT_SYSTEM_PROMPT, AGENT_PRE_CODE_QUESTIONS } from "./src/config/agentConfig";
import * as db from "./db.js";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

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

  // Projects: create
  app.post("/api/users/:userId/projects", (req, res) => {
    try {
      const { userId } = req.params;
      const { name } = req.body as { name?: string };
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
      const model = process.env.GROK_MODEL || "grok-3-latest";
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
      if (!response.ok) {
        const errText = await response.text();
        res.status(response.status).json({ error: "Grok API error", details: errText });
        return;
      }
      const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content ?? "";
      res.json({ message: { role: "assistant", content } });
    } catch (err) {
      console.error("[Grok chat]", err);
      res.status(500).json({ error: "Grok chat failed" });
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

  app.post("/api/netlify/hook", async (req, res) => {
    try {
      if (!process.env.NETLIFY_CLIENT_ID) {
        console.log("Add NETLIFY_CLIENT_ID to .env");
      }
      // Mock Netlify hook creation
      console.log(`[Mock] Creating Netlify hook...`);
      res.json({ status: "success", message: "Netlify hook created successfully (Mock)" });
    } catch (error) {
      res.status(500).json({ error: "Hook creation failed" });
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
  });
}

startServer();
