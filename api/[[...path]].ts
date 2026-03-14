/**
 * Vercel serverless catch-all: run the Express backend for all /api/* requests.
 * Set env vars in Vercel (XAI_API_KEY, SUPABASE_URL, etc.). For project storage use Supabase so data persists.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createApp } from "../server";

let appPromise: Promise<Awaited<ReturnType<typeof createApp>>> | null = null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const rawUrl = (req as unknown as { url?: string }).url || "";
  let pathname: string;
  let qs = "";
  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
    try {
      const u = new URL(rawUrl);
      pathname = u.pathname;
      qs = u.search || "";
    } catch {
      pathname = "/api";
    }
  } else {
    const pathOnly = rawUrl.includes("?") ? rawUrl.slice(0, rawUrl.indexOf("?")) : rawUrl;
    pathname = pathOnly.startsWith("/") ? pathOnly : "/" + pathOnly;
    qs = rawUrl.includes("?") ? "?" + rawUrl.split("?")[1] : "";
  }
  // If path doesn't start with /api, prepend it (catch-all may strip it)
  if (!pathname.startsWith("/api")) pathname = "/api" + (pathname === "/" ? "" : pathname);
  (req as unknown as { url: string }).url = pathname + qs;

  if (!appPromise) appPromise = createApp();
  const app = await appPromise;
  return app(req, res);
}
