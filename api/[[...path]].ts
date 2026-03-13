/**
 * Vercel serverless catch-all: run the Express backend for all /api/* requests.
 * Set env vars in Vercel (GROK_API_KEY, SUPABASE_URL, etc.). For project storage use Supabase so data persists.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createApp } from "../server";

let appPromise: Promise<Awaited<ReturnType<typeof createApp>>> | null = null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!appPromise) appPromise = createApp();
  const app = await appPromise;
  return app(req, res);
}
