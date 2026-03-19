/**
 * Trigger Vercel preview deployments (REST). Server-only.
 */

export type VercelDeployResult = {
  id?: string;
  url?: string;
  readyState?: string;
  inspectorUrl?: string;
  raw?: unknown;
};

/** POST a Deploy Hook (branch-specific hook in Vercel dashboard). */
export async function triggerVercelDeployHook(hookUrl: string): Promise<{ ok: boolean; status: number; text: string }> {
  const r = await fetch(hookUrl, { method: "POST" });
  const text = await r.text();
  return { ok: r.ok, status: r.status, text: text.slice(0, 500) };
}

/** Create a preview deployment from GitHub ref (requires Vercel project linked to that repo). */
export async function createVercelGithubPreviewDeployment(opts: {
  token: string;
  projectId: string;
  org: string;
  repo: string;
  ref: string;
  teamId?: string;
}): Promise<VercelDeployResult> {
  const q = opts.teamId ? `?teamId=${encodeURIComponent(opts.teamId)}` : "";
  const r = await fetch(`https://api.vercel.com/v13/deployments${q}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      project: opts.projectId,
      target: "preview",
      gitSource: {
        type: "github",
        org: opts.org,
        repo: opts.repo,
        ref: opts.ref,
      },
    }),
  });
  const raw = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(
      typeof (raw as { error?: { message?: string } }).error?.message === "string"
        ? (raw as { error: { message: string } }).error.message
        : `Vercel ${r.status}: ${JSON.stringify(raw).slice(0, 400)}`
    );
  }
  const d = raw as {
    id?: string;
    url?: string;
    readyState?: string;
    inspectorUrl?: string;
  };
  return {
    id: d.id,
    url: d.url ? `https://${d.url}` : undefined,
    readyState: d.readyState,
    inspectorUrl: d.inspectorUrl,
    raw,
  };
}
