import { useMemo, useEffect } from "react";
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

export type MindMapData = {
  nodes: { id: string; label: string; type?: "central" | "branch" }[];
  edges: { source: string; target: string }[];
};

function layoutNodes(data: MindMapData): Node[] {
  const { nodes } = data;
  const center = { x: 400, y: 150 };
  const radius = 220;
  const central = nodes.find((n) => n.type === "central" || n.id === "1" || nodes.length === 1);
  const branches = nodes.filter((n) => n !== central);
  const result: Node[] = [];
  if (central) {
    result.push({
      id: central.id,
      position: center,
      data: { label: central.label },
      type: "input",
    });
  }
  branches.forEach((b, i) => {
    const angle = (i / Math.max(branches.length, 1)) * 2 * Math.PI - Math.PI / 2;
    result.push({
      id: b.id,
      position: { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) },
      data: { label: b.label },
      type: "output",
    });
  });
  return result.length ? result : [{ id: "empty", position: center, data: { label: "No nodes" } }];
}

function toEdges(data: MindMapData): Edge[] {
  return data.edges.map((e, i) => ({
    id: `e${i}-${e.source}-${e.target}`,
    source: e.source,
    target: e.target,
    animated: true,
  }));
}

type Props = { data: MindMapData | null; className?: string };

export default function MindMapFromPlan({ data, className = "" }: Props) {
  const initialNodes = useMemo(() => (data ? layoutNodes(data) : []), [data]);
  const initialEdges = useMemo(() => (data ? toEdges(data) : []), [data]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    if (data?.nodes?.length) {
      setNodes(layoutNodes(data));
      setEdges(toEdges(data));
    }
  }, [data, setNodes, setEdges]);

  if (!data || !data.nodes?.length) {
    return (
      <div className={`flex items-center justify-center bg-vs-bg border border-vs-border rounded-lg text-vs-muted ${className}`}>
        No mind map data. Say &quot;show mind map&quot; after planning.
      </div>
    );
  }

  return (
    <div className={`w-full h-full bg-vs-bg rounded-lg border border-vs-border overflow-hidden ${className}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        colorMode="dark"
      >
        <Controls />
        <MiniMap
          nodeStrokeColor={() => "var(--accent)"}
          nodeColor={() => "var(--bg-editor)"}
        />
        <Background gap={12} size={1} />
      </ReactFlow>
    </div>
  );
}
