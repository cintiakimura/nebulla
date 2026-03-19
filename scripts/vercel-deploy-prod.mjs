#!/usr/bin/env node
/**
 * Production deploy: loads project `.env`, then runs Vercel CLI with a token if set.
 * Supports VERCEL_TOKEN (standard) or VERCEL_TOKEN_19_MAR (legacy name in some .env files).
 */
import dotenv from "dotenv";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(root, "..");
dotenv.config({ path: path.join(projectRoot, ".env") });
process.chdir(projectRoot);

const token = (process.env.VERCEL_TOKEN || process.env.VERCEL_TOKEN_19_MAR || "").trim();
if (!token) {
  console.error(
    "[deploy] No VERCEL_TOKEN (or VERCEL_TOKEN_19_MAR) found after loading .env — Vercel may use an old invalid login.\n" +
      "        Add one: Vercel dashboard → Account Settings → Tokens → create token, then in .env:\n" +
      "        VERCEL_TOKEN=vcp_...\n"
  );
}
const vercelCli = path.join(projectRoot, "node_modules", "vercel", "dist", "vc.js");
const useLocal = existsSync(vercelCli);

const args = useLocal ? [vercelCli, "--prod"] : ["vercel", "--prod"];
if (token) {
  args.push("--token", token);
}

try {
  if (useLocal) {
    execFileSync(process.execPath, args, { stdio: "inherit", cwd: projectRoot });
  } else {
    execFileSync("npx", args, { stdio: "inherit", cwd: projectRoot, shell: process.platform === "win32" });
  }
} catch (e) {
  const code = typeof e?.status === "number" ? e.status : 1;
  process.exit(code);
}
