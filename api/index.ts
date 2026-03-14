/**
 * Single API handler for all /api/* requests (used with vercel.json rewrite).
 * Rewrite sends /api/:path* → /api?path=:path*; we set req.url for Express.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createApp } from "../server";

let appPromise: Promise<Awaited<ReturnType<typeof createApp>>> | null = null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const pathParam = req.query?.path;
  const pathSeg = pathParam !== undefined && pathParam !== null
    ? (Array.isArray(pathParam) ? pathParam.join("/") : String(pathParam))
    : "";
  const pathname = "/api" + (pathSeg ? `/${pathSeg}` : "");
  (req as NodeJS.IncomingMessage & { url: string }).url = pathname;
  console.log("[api/index]", req.method, pathname);

  // Catch-all: if GET open-dev-user/projects, return 200 + [] here so dashboard loads even if Express isn't reached.
  if (req.method === "GET" && pathname.includes("open-dev-user/projects")) {
    console.log("[api/index] catch-all open-dev-user/projects → 200 []");
    return res.status(200).json([]);
  }

  if (!appPromise) appPromise = createApp();
  const app = await appPromise;
  return app(req, res);
}
