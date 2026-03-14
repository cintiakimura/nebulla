/**
 * Single API handler for all /api/* requests (used with vercel.json rewrite).
 * Rewrite sends /api/:path* → /api?path=:path*; we set req.url for Express.
 * Open-dev-user GET/POST are handled here so we never load server.ts (and better-sqlite3) on Vercel.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const OPEN_DEV_PATH = "/api/users/open-dev-user/projects";

const defaultCode = `export default function App() {
  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h1>Hello from kyn Builder</h1>
      <p>Start editing to see some magic happen!</p>
    </div>
  );
}`;
const defaultPackageJson = JSON.stringify({ name: "kyn-app", private: true, version: "0.0.0" }, null, 2);

async function handleOpenDevUser(
  method: string,
  req: VercelRequest,
  res: VercelResponse
): Promise<boolean> {
  const pathParam = req.query?.path;
  const pathSeg = pathParam !== undefined && pathParam !== null
    ? (Array.isArray(pathParam) ? pathParam.join("/") : String(pathParam))
    : "";
  const pathname = "/api" + (pathSeg ? `/${pathSeg}` : "");
  if (pathname !== OPEN_DEV_PATH) return false;

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  // Use existing open-mode user from .env so projects go to your Supabase
  const fallbackUserId = process.env.OPEN_MODE_FALLBACK_USER_ID?.trim();
  const supabaseOk = supabaseUrl && supabaseKey && supabaseUrl !== "PLACEHOLDER" && supabaseKey !== "PLACEHOLDER";

  if (method === "GET") {
    if (supabaseOk && fallbackUserId) {
      try {
        const supabase = createClient(supabaseUrl!, supabaseKey!, { auth: { persistSession: false } });
        const { data, error } = await supabase
          .from("projects")
          .select("id, user_id, name, status, last_edited, created_at")
          .eq("user_id", fallbackUserId)
          .order("created_at", { ascending: false });
        if (error) {
          console.error("[api/index] open-dev-user GET", error.message);
          res.status(500).json({ error: "Failed to list projects" });
          return true;
        }
        res.status(200).json(data ?? []);
        return true;
      } catch (e) {
        console.error("[api/index] open-dev-user GET", e);
        res.status(500).json({ error: "Failed to list projects" });
        return true;
      }
    }
    res.status(200).json([]);
    return true;
  }

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
        if (error) {
          console.error("[api/index] open-dev-user POST", error.message);
          res.status(500).json({ error: "Failed to create project" });
          return true;
        }
        res.status(201).json(data);
        return true;
      } catch (e) {
        console.error("[api/index] open-dev-user POST", e);
        res.status(500).json({ error: "Failed to create project" });
        return true;
      }
    }

    // No Supabase or no OPEN_MODE_FALLBACK_USER_ID: return 201 so onboarding doesn't 500 (no persistence)
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

let appPromise: Promise<Awaited<ReturnType<typeof import("../server").createApp>>> | null = null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const pathParam = req.query?.path;
  const pathSeg = pathParam !== undefined && pathParam !== null
    ? (Array.isArray(pathParam) ? pathParam.join("/") : String(pathParam))
    : "";
  const pathname = "/api" + (pathSeg ? `/${pathSeg}` : "");
  (req as unknown as { url: string }).url = pathname;
  console.log("[api/index]", req.method, pathname);

  const handled = await handleOpenDevUser(req.method ?? "GET", req, res);
  if (handled) return;

  const { createApp } = await import("../server");
  if (!appPromise) appPromise = createApp();
  const app = await appPromise;
  return app(req, res);
}
