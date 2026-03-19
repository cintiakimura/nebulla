import { useState, useCallback } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Node,
  Edge,
  Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const initialNodes: Node[] = [
  { id: '1', position: { x: 250, y: 5 }, data: { label: 'Login Page' }, type: 'input' },
  { id: '2', position: { x: 100, y: 100 }, data: { label: 'Admin Dashboard' } },
  { id: '3', position: { x: 400, y: 100 }, data: { label: 'User Dashboard' } },
  { id: '4', position: { x: 250, y: 200 }, data: { label: 'Database (Users, Roles)' }, type: 'output' },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', animated: true, label: 'if Admin' },
  { id: 'e1-3', source: '1', target: '3', animated: true, label: 'if User' },
  { id: 'e2-4', source: '2', target: '4' },
  { id: 'e3-4', source: '3', target: '4' },
];

export default function MindMap() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  return (
    <div className="w-full h-full bg-editor-bg rounded-lg border border-border overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        colorMode="dark"
      >
        <Controls />
        <MiniMap nodeStrokeColor={(n) => {
          if (n.type === 'input') return '#0041d0';
          if (n.type === 'output') return '#ff0072';
          return '#1a192b';
        }} nodeColor={(n) => {
          if (n.type === 'input') return '#0041d0';
          if (n.type === 'output') return '#ff0072';
          return '#1a192b';
        }} />
        <Background gap={12} size={1} />
      </ReactFlow>
    </div>
  );
}
