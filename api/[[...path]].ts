/**
 * Vercel serverless catch-all: run the Express backend for all /api/* requests.
 * Set env vars in Vercel (GROK_API_KEY, SUPABASE_URL, etc.). For project storage use Supabase so data persists.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createApp } from "../server";

let appPromise: Promise<Awaited<ReturnType<typeof createApp>>> | null = null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Ensure Express sees the full path (Vercel catch-all may pass segments in req.query.path)
  const u = (req as NodeJS.IncomingMessage & { url?: string }).url || "";
  if (!u.startsWith("/api/") && !u.startsWith("/api")) {
    const pathSeg = (req.query?.path as string[] | string) ?? [];
    const path = Array.isArray(pathSeg) ? pathSeg.join("/") : String(pathSeg || "");
    (req as NodeJS.IncomingMessage & { url: string }).url = "/api" + (path ? `/${path}` : "") + (u.includes("?") ? "?" + u.split("?")[1] : "");
  }

  if (!appPromise) appPromise = createApp();
  const app = await appPromise;
  return app(req, res);
}
