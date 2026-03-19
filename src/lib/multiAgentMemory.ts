const KEY = "kyn_multi_agent_tasks_v1";
const MAX = 10;

export type AgentTaskMemory = {
  id: string;
  at: string;
  kind: "code" | "deploy" | "chain";
  status: "ok" | "error";
  summary: string;
  preview_url?: string;
  commit_url?: string;
};

export function loadAgentTaskMemory(): AgentTaskMemory[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as AgentTaskMemory[];
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

export function pushAgentTaskMemory(entry: Omit<AgentTaskMemory, "id" | "at"> & { id?: string }): AgentTaskMemory[] {
  const id = entry.id ?? crypto.randomUUID();
  const at = new Date().toISOString();
  const row: AgentTaskMemory = {
    id,
    at,
    kind: entry.kind,
    status: entry.status,
    summary: entry.summary,
    preview_url: entry.preview_url,
    commit_url: entry.commit_url,
  };
  const prev = loadAgentTaskMemory();
  const next = [row, ...prev].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota */
  }
  return next;
}
