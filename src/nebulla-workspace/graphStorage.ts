import type { Edge, Node } from "@xyflow/react";

const KEY = "nebulla_workspace_graph_v2";

export type StoredGraph = { pages: Node[]; edges: Edge[] };

export function loadWorkspaceGraph(fallback: StoredGraph): StoredGraph {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as StoredGraph;
    if (!Array.isArray(p.pages) || !Array.isArray(p.edges)) return fallback;
    return { pages: p.pages, edges: p.edges };
  } catch {
    return fallback;
  }
}

export function saveWorkspaceGraph(data: StoredGraph): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* ignore quota */
  }
}
