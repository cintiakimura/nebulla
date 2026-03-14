/**
 * Vercel serverless catch-all: run the Express backend for all /api/* requests.
 * Set env vars in Vercel (GROK_API_KEY, SUPABASE_URL, etc.). For project storage use Supabase so data persists.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createApp } from "../server";

let appPromise: Promise<Awaited<ReturnType<typeof createApp>>> | null = null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel catch-all: path segments in req.query.path, or take pathname from req.url.
  const pathSeg = req.query?.path;
  let pathname: string;
  if (pathSeg !== undefined && pathSeg !== null) {
    const segments = Array.isArray(pathSeg) ? pathSeg : [pathSeg];
    pathname = "/api" + (segments.length ? "/" + segments.join("/") : "");
  } else {
    const u = (req as NodeJS.IncomingMessage & { url?: string }).url || "";
    const pathOnly = u.includes("?") ? u.slice(0, u.indexOf("?")) : u;
    pathname = pathOnly.startsWith("/") ? pathOnly : "/" + pathOnly;
  }
  const qs = typeof req.url === "string" && req.url.includes("?") ? "?" + req.url.split("?")[1] : "";
  (req as NodeJS.IncomingMessage & { url: string }).url = pathname + qs;

  if (!appPromise) appPromise = createApp();
  const app = await appPromise;
  return app(req, res);
}
