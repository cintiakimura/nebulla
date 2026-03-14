/**
 * Minimal API route to verify Vercel serverless functions are reached.
 * GET /api/ping → 200 { "ok": true }. If this works, /api/* is hitting Vercel; if not, check rewrites/build.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ ok: true, message: "API is reachable" });
}
