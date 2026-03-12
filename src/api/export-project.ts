/**
 * Export project as zip: frontend code, mind map JSON, backend stubs, .env.example with placeholders only.
 * Security: zip MUST NOT include any real URLs or keys (Supabase URL, anon, service_role, STRIPE_*, webhook). .env.example uses placeholders only.
 */
import type { Request, Response } from "express";
import JSZip from "jszip";
import * as db from "../../db.js";
import {
  isSupabaseConfigured,
  getProject as getSupabaseProject,
  getUserMetadata,
} from "../lib/supabase-multi-tenant.js";

export type ProjectSource = {
  id: string;
  name: string;
  code: string;
  package_json: string;
  chat_messages: string;
  specs: string;
};

async function getProjectForExport(userId: string, projectId: string): Promise<ProjectSource | null> {
  if (isSupabaseConfigured()) {
    const row = await getSupabaseProject(userId, projectId);
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      package_json: row.package_json,
      chat_messages: row.chat_messages,
      specs: row.specs,
    };
  }
  const row = db.getProject(userId, projectId);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    package_json: row.package_json,
    chat_messages: row.chat_messages,
    specs: row.specs,
  };
}

export async function handleExportProject(req: Request, res: Response): Promise<void> {
  const userId = (req as unknown as { userId?: string }).userId;
  const projectId = req.params.id;
  if (!userId || !projectId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const project = await getProjectForExport(userId, projectId);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const meta = isSupabaseConfigured() ? await getUserMetadata(userId) : null;
  const isPro = meta?.is_pro ?? meta?.paid ?? false;
  if (isSupabaseConfigured() && !isPro) {
    res.status(403).json({ error: "Export is a Pro feature. Upgrade to export projects." });
    return;
  }
  // Only placeholders go into the zip — no real URLs or keys (avoids leaking backend infra).
  const zip = new JSZip();
  zip.file("App.tsx", project.code);
  zip.file("package.json", project.package_json);
  zip.file("mind-map.json", project.specs && project.specs !== "{}" ? project.specs : "{}");
  zip.file("chat.json", project.chat_messages);
  zip.file("chat_messages.json", project.chat_messages);

  const backendStub = `// kyn export – run with: node server-stub.js
const express = require('express');
const app = express();
app.use(express.json());
app.use(express.static('dist'));
app.listen(process.env.PORT || 3000, () => console.log('Running'));
`;
  zip.file("server-stub.js", backendStub);

  const readme = `# ${project.name}

Exported from kyn (kyn.app).

## Setup

1. \`npm install\`
2. Copy \`.env.example\` to \`.env\` and add your Supabase URL and anon key (from Supabase dashboard → Settings → API). Never commit the real \`.env\`.

3. \`npm run build\` then \`node server-stub.js\`

## Keys

- Supabase anon key is safe for client-side use (RLS protects data).
- Never commit service_role key. This export does not include it.
${isPro ? "- Pro: Add your own GROK_API_KEY to .env for AI features.\n" : ""}
`;
  zip.file("README.md", readme);

  const envExample = [
    "SUPABASE_URL=YOUR_SUPABASE_URL",
    "SUPABASE_ANON_KEY=YOUR_ANON_KEY",
    isPro ? "GROK_API_KEY=your_key" : "",
  ]
    .filter(Boolean)
    .join("\n");
  zip.file(".env.example", envExample);

  const buf = await zip.generateAsync({ type: "nodebuffer" });
  const filename = `${project.name.replace(/[^a-z0-9-_]/gi, "-")}-export.zip`;
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buf);
}
