/**
 * Commit files to GitHub using a classic PAT (GITHUB_TOKEN). Server-only.
 */

export type GithubPutResult = { sha: string; url: string };

export async function putGithubFile(opts: {
  token: string;
  owner: string;
  repo: string;
  path: string;
  content: string;
  message: string;
  branch: string;
}): Promise<GithubPutResult> {
  const { token, owner, repo, path, content, message, branch } = opts;
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };

  let sha: string | undefined;
  const get = await fetch(`${url}?ref=${encodeURIComponent(branch)}`, { headers });
  if (get.ok) {
    const j = (await get.json()) as { sha?: string };
    sha = j.sha;
  }

  const body: Record<string, string> = {
    message,
    content: Buffer.from(content, "utf8").toString("base64"),
    branch,
  };
  if (sha) body.sha = sha;

  const put = await fetch(url, { method: "PUT", headers, body: JSON.stringify(body) });
  const text = await put.text();
  if (!put.ok) {
    throw new Error(`GitHub PUT ${path}: ${put.status} ${text.slice(0, 400)}`);
  }
  const out = JSON.parse(text) as { commit?: { sha?: string; html_url?: string } };
  const commitSha = out.commit?.sha ?? "";
  return {
    sha: commitSha,
    url: out.commit?.html_url ?? `https://github.com/${owner}/${repo}/commit/${commitSha}`,
  };
}
