/**
 * Env-only secrets audit for GET /api/config/secrets-audit (no DB).
 * Used by Express server and Vercel api/index fast path so serverless never loads better-sqlite3 for these routes.
 */

import { envConfigured } from "./integrationsSummary.js";

export function buildSecretsAuditPayload() {
  const grokConfigured = envConfigured("XAI_API_KEY") || envConfigured("GROK_API_KEY");
  const items = [
    { key: "SUPABASE_URL", category: "core" as const, configured: envConfigured("SUPABASE_URL") },
    {
      key: "SUPABASE_PUBLISHABLE_KEY",
      category: "core" as const,
      configured: envConfigured("SUPABASE_PUBLISHABLE_KEY") || envConfigured("SUPABASE_ANON_KEY"),
    },
    { key: "SUPABASE_SECRET_KEY", category: "core" as const, configured: envConfigured("SUPABASE_SECRET_KEY") },
    { key: "XAI_API_KEY", category: "ai" as const, configured: grokConfigured, aliases: ["GROK_API_KEY"] },
    {
      key: "STITCH_API_KEY",
      category: "integrations" as const,
      configured: envConfigured("STITCH_API_KEY") || envConfigured("GOOGLE_STITCH_API_KEY"),
      aliases: ["GOOGLE_STITCH_API_KEY"],
    },
    { key: "STITCH_PROJECT_ID", category: "integrations" as const, configured: envConfigured("STITCH_PROJECT_ID") },
    { key: "ALLOWED_ORIGIN", category: "deploy" as const, configured: envConfigured("ALLOWED_ORIGIN") },
    { key: "APP_URL", category: "deploy" as const, configured: envConfigured("APP_URL") },
    { key: "STRIPE_SECRET_KEY", category: "billing" as const, configured: envConfigured("STRIPE_SECRET_KEY") },
    { key: "STRIPE_WEBHOOK_SECRET", category: "billing" as const, configured: envConfigured("STRIPE_WEBHOOK_SECRET") },
    { key: "FIREBASE_PROJECT_ID", category: "optional" as const, configured: envConfigured("FIREBASE_PROJECT_ID") },
    { key: "GITHUB_CLIENT_ID", category: "optional" as const, configured: envConfigured("GITHUB_CLIENT_ID") },
    {
      key: "VERCEL_TOKEN",
      category: "optional" as const,
      configured: envConfigured("VERCEL_TOKEN") || envConfigured("VERCEL_ACCESS_TOKEN"),
      aliases: ["VERCEL_ACCESS_TOKEN"],
    },
    { key: "BLOB_READ_WRITE_TOKEN", category: "optional" as const, configured: envConfigured("BLOB_READ_WRITE_TOKEN") },
    { key: "VERCEL_PROJECT_ID", category: "optional" as const, configured: envConfigured("VERCEL_PROJECT_ID") },
    {
      key: "STRICT_SERVER_API_KEYS",
      category: "deploy" as const,
      configured: envConfigured("STRICT_SERVER_API_KEYS"),
    },
  ];
  return {
    runtime: {
      nodeEnv: process.env.NODE_ENV ?? "development",
      vercel: process.env.VERCEL === "1",
    },
    items,
  };
}

const PRODUCTION_CHECKLIST = [
  "Vercel (or host): Project → Settings → Environment Variables — copy every required key from .env.example into Production (and Preview if you use preview URLs).",
  "Vercel sets NODE_ENV=production automatically for production deployments.",
  "Frontend build: set VITE_API_URL to your backend origin if the UI is on a different host than the API.",
  "Supabase Dashboard → Authentication → URL configuration: add your production Site URL and redirect https://<your-domain>/auth/callback",
  "After changing env vars on the host, redeploy so all serverless instances pick up new values.",
] as const;

export function buildProductionReadinessPayload() {
  const audit = buildSecretsAuditPayload();
  const coreMissing = audit.items.filter((i) => i.category === "core" && !i.configured).map((i) => i.key);
  return {
    ...audit,
    coreConfigured: coreMissing.length === 0,
    coreMissing,
    productionChecklist: [...PRODUCTION_CHECKLIST],
  };
}

const ALIGN_KEYS = [
  "XAI_API_KEY",
  "GROK_API_KEY",
  "STITCH_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_PUBLIC_KEY",
] as const;

export function buildSecretsAlignmentPayload(browser: Record<string, boolean>) {
  const grokEnv = envConfigured("XAI_API_KEY") || envConfigured("GROK_API_KEY");
  const stitchEnv = envConfigured("STITCH_API_KEY") || envConfigured("GOOGLE_STITCH_API_KEY");
  const rows = ALIGN_KEYS.map((key) => {
    let server = false;
    if (key === "XAI_API_KEY" || key === "GROK_API_KEY") server = grokEnv;
    else if (key === "STITCH_API_KEY") server = stitchEnv;
    else server = envConfigured(key);
    const browserSet = !!browser[key];
    const aligned = server === browserSet;
    const hint = !server && !browserSet
      ? "Optional — set on server (recommended) or in Settings → secrets for this browser."
      : server && !browserSet
        ? "Server has this key; browser vault empty — OK if you only use server env."
        : !server && browserSet
          ? "Browser-only override — mirror the same key in host env for production."
          : "Both server and this browser have a value — ensure they match if you see mismatched-behavior bugs.";
    return { key, serverConfigured: server, browserConfigured: browserSet, aligned, hint };
  });
  return { rows, auditedAt: new Date().toISOString() };
}
