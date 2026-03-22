/**
 * Shared JSON for GET /api/integrations/summary (Express server + Vercel api/index fast path).
 * No secret values — booleans and optional Vercel REST metadata only.
 */

export function envConfigured(name: string): boolean {
  const v = process.env[name]?.trim();
  return !!v && v !== "PLACEHOLDER";
}

export function strictServerSecretsOnly(): boolean {
  const v = process.env.STRICT_SERVER_API_KEYS?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

async function fetchVercelProjectMeta(): Promise<{
  linked: boolean;
  projectName?: string;
  framework?: string;
  latestDeployment?: { state?: string; url?: string; createdAt?: number };
  error?: string;
}> {
  const token = process.env.VERCEL_ACCESS_TOKEN?.trim();
  const projectId = process.env.VERCEL_PROJECT_ID?.trim();
  if (!token || !projectId) {
    return { linked: false };
  }
  try {
    const r = await fetch(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) {
      const errText = await r.text();
      return { linked: true, error: `Vercel API ${r.status}: ${errText.slice(0, 120)}` };
    }
    const data = (await r.json()) as { name?: string; framework?: string | null };
    let latestDeployment: { state?: string; url?: string; createdAt?: number } | undefined;
    try {
      const d = await fetch(
        `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=1`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (d.ok) {
        const depJson = (await d.json()) as { deployments?: { state?: string; url?: string; createdAt?: number }[] };
        const first = depJson.deployments?.[0];
        if (first) latestDeployment = { state: first.state, url: first.url, createdAt: first.createdAt };
      }
    } catch (_) {
      /* optional */
    }
    return {
      linked: true,
      projectName: data.name,
      framework: data.framework ?? undefined,
      latestDeployment,
    };
  } catch (e) {
    return { linked: true, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getIntegrationsSummaryJson(): Promise<Record<string, unknown>> {
  const grok = envConfigured("XAI_API_KEY") || envConfigured("GROK_API_KEY");
  const supabaseUrl = envConfigured("SUPABASE_URL");
  const supabasePub = envConfigured("SUPABASE_PUBLISHABLE_KEY") || envConfigured("SUPABASE_ANON_KEY");
  const supabaseSecret = envConfigured("SUPABASE_SECRET_KEY");
  const stitchUi =
    envConfigured("STITCH_API_KEY") || envConfigured("GOOGLE_STITCH_API_KEY");
  const stripe = envConfigured("STRIPE_SECRET_KEY");
  const stripeWebhook = envConfigured("STRIPE_WEBHOOK_SECRET");
  let vercelProject: Record<string, unknown> | null = null;
  const vercelMeta = await fetchVercelProjectMeta();
  if (vercelMeta.error) {
    vercelProject = { error: vercelMeta.error };
  } else if (vercelMeta.linked) {
    vercelProject = {
      name: vercelMeta.projectName,
      framework: vercelMeta.framework,
      latestDeployment: vercelMeta.latestDeployment ?? null,
    };
  }
  return {
    architecture: "backend-first-monorepo",
    description:
      "Grok, Supabase (server + config for client), Google Stitch (UI generation), and Stripe are driven from this API; secrets stay in host env. OAuth still uses the browser for provider login.",
    strictServerSecretsOnly: strictServerSecretsOnly(),
    services: {
      grok: {
        configured: grok,
        routes: ["/api/agent/chat", "/api/tts", "/api/images/generate", "/api/realtime/token"],
      },
      supabase: {
        url: supabaseUrl,
        publishableKey: supabasePub,
        secretKey: supabaseSecret,
        publicConfigRoute: "/api/config",
      },
      stitch: {
        configured: stitchUi,
        routes: ["/api/builder/generate"],
      },
      stripe: {
        secretKey: stripe,
        webhookSecret: stripeWebhook,
      },
      vercel: {
        runningOnVercel: process.env.VERCEL === "1",
        deploymentUrl: process.env.VERCEL_URL ?? null,
        apiLinked: vercelMeta.linked && !vercelMeta.error,
        project: vercelProject,
        ...(vercelMeta.linked
          ? {}
          : {
              hint: "Add VERCEL_ACCESS_TOKEN (account token) + VERCEL_PROJECT_ID to show project name & latest deployment here.",
            }),
      },
    },
  };
}
