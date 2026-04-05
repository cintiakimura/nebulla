import React, { useState, useCallback } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  Panel,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const PageNode = ({ data, id }: { data: Record<string, unknown>; id: string }) => {
  const onDelete = data.onDelete as (x: string) => void;
  const onOpenEdit = data.onOpenEdit as ((nodeId: string) => void) | undefined;
  const label = String(data.label ?? "");
  const isCreated = Boolean(data.isCreated);
  const desc = String(data.description ?? "");
  return (
    <div
      className="px-4 py-2 shadow-lg rounded-md bg-[#040f1a] border border-cyan-500/30 min-w-[150px] max-w-[220px] relative group cursor-pointer"
      onClick={() => onOpenEdit?.(id)}
      onKeyDown={(e) => e.key === "Enter" && onOpenEdit?.(id)}
      role="button"
      tabIndex={0}
    >
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-cyan-400" />
      <div className="flex justify-between items-start gap-2">
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-headline text-cyan-300 truncate">{label}</span>
          {desc ? <span className="text-[10px] text-slate-500 line-clamp-2 mt-0.5">{desc}</span> : null}
          {isCreated ? (
            <span className="text-[10px] text-emerald-400 flex items-center gap-1 mt-1">
              <span className="material-symbols-outlined text-[12px]">link</span>
              Live Link
            </span>
          ) : (
            <span className="text-[10px] text-slate-500 mt-1">Pending Creation</span>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(id);
          }}
          className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-opacity shrink-0"
        >
          <span className="material-symbols-outlined text-14">delete</span>
        </button>
      </div>
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-cyan-400" />
    </div>
  );
};

const nodeTypes = { pageNode: PageNode };

function ZoomToolbar({ onToggleCollapse }: { onToggleCollapse: () => void }) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  return (
    <Panel position="top-right" className="m-2 flex flex-col gap-1.5">
      <button
        type="button"
        title="Collapse / expand map panel"
        onClick={onToggleCollapse}
        className="flex items-center justify-center w-9 h-9 rounded-md bg-[#040f1a]/90 border border-white/10 text-cyan-300 hover:bg-cyan-500/10 transition-colors"
      >
        <span className="material-symbols-outlined text-18">unfold_less</span>
      </button>
      <button
        type="button"
        title="Zoom in"
        onClick={() => zoomIn()}
        className="flex items-center justify-center w-9 h-9 rounded-md bg-[#040f1a]/90 border border-white/10 text-cyan-300 hover:bg-cyan-500/10"
      >
        <span className="material-symbols-outlined text-18">add</span>
      </button>
      <button
        type="button"
        title="Zoom out"
        onClick={() => zoomOut()}
        className="flex items-center justify-center w-9 h-9 rounded-md bg-[#040f1a]/90 border border-white/10 text-cyan-300 hover:bg-cyan-500/10"
      >
        <span className="material-symbols-outlined text-18">remove</span>
      </button>
      <button
        type="button"
        title="Fit view"
        onClick={() => fitView({ padding: 0.2 })}
        className="flex items-center justify-center w-9 h-9 rounded-md bg-[#040f1a]/90 border border-white/10 text-cyan-300 hover:bg-cyan-500/10"
      >
        <span className="material-symbols-outlined text-18">fit_screen</span>
      </button>
    </Panel>
  );
}

type InnerProps = {
  pages: Node[];
  setPages: React.Dispatch<React.SetStateAction<Node[]>>;
  edges: Edge[];
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  onSaveToMasterPlan: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
};

function MindMapFlowInner({ pages, setPages, edges, setEdges, onSaveToMasterPlan, collapsed, onToggleCollapse }: InnerProps) {
  const [nodeToDelete, setNodeToDelete] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newPageName, setNewPageName] = useState("");
  const [pendingConnection, setPendingConnection] = useState<Connection | null>(null);
  const [showConnectConfirm, setShowConnectConfirm] = useState(false);
  const [edgeToDelete, setEdgeToDelete] = useState<string | null>(null);
  const [showEdgeDeleteConfirm, setShowEdgeDeleteConfirm] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const handleDeleteRequest = useCallback((id: string) => {
    setNodeToDelete(id);
    setShowDeleteConfirm(true);
  }, []);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const removeChanges = changes.filter((c) => c.type === "remove");
      if (removeChanges.length > 0) {
        const rid = (removeChanges[0] as { id?: string }).id;
        if (rid) handleDeleteRequest(rid);
        const otherChanges = changes.filter((c) => c.type !== "remove");
        if (otherChanges.length > 0) {
          setPages((nds) => applyNodeChanges(otherChanges, nds));
        }
        return;
      }
      setPages((nds) => applyNodeChanges(changes, nds));
      const isDragStop = changes.some((c) => c.type === "position" && "dragging" in c && !c.dragging);
      if (isDragStop) onSaveToMasterPlan();
    },
    [setPages, handleDeleteRequest, onSaveToMasterPlan]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const removeChanges = changes.filter((c) => c.type === "remove");
      if (removeChanges.length > 0) {
        const eid = (removeChanges[0] as { id?: string }).id;
        if (eid) setEdgeToDelete(eid);
        setShowEdgeDeleteConfirm(true);
        const otherChanges = changes.filter((c) => c.type !== "remove");
        if (otherChanges.length > 0) {
          setEdges((eds) => applyEdgeChanges(otherChanges, eds));
        }
        return;
      }
      const nonSelect = changes.filter((c) => c.type !== "select");
      setEdges((eds) => applyEdgeChanges(changes, eds));
      if (nonSelect.length > 0) onSaveToMasterPlan();
    },
    [setEdges, onSaveToMasterPlan]
  );

  const onConnect = useCallback((params: Connection) => {
    setPendingConnection(params);
    setShowConnectConfirm(true);
  }, []);

  const confirmConnect = () => {
    if (pendingConnection) {
      setEdges((eds) => addEdge({ ...pendingConnection, animated: true, style: { stroke: "#00ffff" } }, eds));
      onSaveToMasterPlan();
    }
    setShowConnectConfirm(false);
    setPendingConnection(null);
  };

  const confirmEdgeDelete = () => {
    if (edgeToDelete) {
      setEdges((eds) => eds.filter((e) => e.id !== edgeToDelete));
      onSaveToMasterPlan();
    }
    setShowEdgeDeleteConfirm(false);
    setEdgeToDelete(null);
  };

  const confirmDelete = () => {
    if (nodeToDelete) {
      setPages((nds) => nds.filter((n) => n.id !== nodeToDelete));
      setEdges((eds) => eds.filter((e) => e.source !== nodeToDelete && e.target !== nodeToDelete));
      onSaveToMasterPlan();
    }
    setShowDeleteConfirm(false);
    setNodeToDelete(null);
  };

  const openEdit = useCallback(
    (nid: string) => {
      const n = pages.find((p) => p.id === nid);
      if (!n) return;
      setEditingNodeId(nid);
      setEditLabel(String(n.data.label ?? ""));
      setEditDescription(String(n.data.description ?? ""));
    },
    [pages]
  );

  const saveEdit = () => {
    if (!editingNodeId || !editLabel.trim()) return;
    setPages((nds) =>
      nds.map((n) =>
        n.id === editingNodeId
          ? { ...n, data: { ...n.data, label: editLabel.trim(), description: editDescription.trim() } }
          : n
      )
    );
    setEditingNodeId(null);
    onSaveToMasterPlan();
  };

  const handleAddNode = () => {
    if (!newPageName.trim()) return;
    const newNode: Node = {
      id: crypto.randomUUID(),
      type: "pageNode",
      position: { x: Math.random() * 200 + 800, y: 250 + (Math.random() * 100 - 50) },
      data: {
        label: newPageName,
        isCritical: false,
        isCreated: false,
        description: "New page (workspace).",
        onDelete: handleDeleteRequest,
      },
    };
    setPages((nds) => [...nds, newNode]);
    setNewPageName("");
    setShowAddModal(false);
    onSaveToMasterPlan();
  };

  const nodesWithCallbacks = pages.map((node) => ({
    ...node,
    data: { ...node.data, onDelete: handleDeleteRequest, onOpenEdit: openEdit },
  }));

  const nodeToDeleteData = pages.find((n) => n.id === nodeToDelete);

  if (collapsed) {
    return (
      <div className="h-12 flex items-center justify-between px-3 border-b border-white/5 bg-[#040f1a]/80 shrink-0">
        <span className="text-13 text-slate-400 font-headline">Mind map collapsed</span>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="text-cyan-300 material-symbols-outlined hover:bg-white/5 rounded p-1"
        >
          expand
        </button>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative bg-[#020810] rounded-md overflow-hidden border border-white/5 shadow-2xl">
      <ReactFlow
        nodes={nodesWithCallbacks}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        nodesDraggable
        nodesConnectable
        elementsSelectable
        fitView
        className="bg-transparent"
        colorMode="dark"
        minZoom={0.2}
        maxZoom={1.8}
      >
        <Background color="#00ffff" gap={16} size={1} />
        <Controls className="bg-[#040f1a] border border-white/10 fill-cyan-300 text-cyan-300 [&_button]:fill-cyan-300 [&_button]:text-cyan-300" />
        <ZoomToolbar onToggleCollapse={onToggleCollapse} />
        <Panel position="top-left" className="m-4">
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 rounded-md text-13 font-headline hover:bg-cyan-500/20 transition-all shadow-[0_0_10px_rgba(0,255,255,0.1)]"
          >
            <span className="material-symbols-outlined text-14">add</span>
            Add Page
          </button>
        </Panel>
      </ReactFlow>

      {showConnectConfirm && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#040f1a] border border-white/10 p-6 rounded-lg shadow-2xl max-w-sm w-full">
            <h3 className="text-lg font-headline text-cyan-300 mb-2">Connect Pages?</h3>
            <p className="text-13 text-slate-300 mb-6">
              Are you sure you want to connect these pages? This will update the application&apos;s architecture and navigation flow.
            </p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => { setShowConnectConfirm(false); setPendingConnection(null); }} className="px-4 py-2 rounded text-13 text-slate-400 hover:bg-white/5 transition-colors">
                Cancel
              </button>
              <button type="button" onClick={confirmConnect} className="px-4 py-2 rounded text-13 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 transition-colors">
                Yes, Connect
              </button>
            </div>
          </div>
        </div>
      )}

      {showEdgeDeleteConfirm && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#040f1a] border border-red-500/30 p-6 rounded-lg shadow-2xl max-w-sm w-full">
            <div className="flex items-center gap-3 mb-2">
              <span className="material-symbols-outlined text-red-400 text-24">warning</span>
              <h3 className="text-lg font-headline text-red-400">Delete Connection?</h3>
            </div>
            <p className="text-13 text-slate-300 mb-6">
              Are you sure you want to remove this connection? This will impact the application&apos;s routing and architecture.
            </p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => { setShowEdgeDeleteConfirm(false); setEdgeToDelete(null); }} className="px-4 py-2 rounded text-13 text-slate-400 hover:bg-white/5 transition-colors">
                Cancel
              </button>
              <button type="button" onClick={confirmEdgeDelete} className="px-4 py-2 rounded text-13 bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors">
                Delete Connection
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && nodeToDeleteData && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#040f1a] border border-red-500/30 p-6 rounded-lg shadow-2xl max-w-sm w-full">
            <div className="flex items-center gap-3 mb-2">
              <span className="material-symbols-outlined text-red-400 text-24">warning</span>
              <h3 className="text-lg font-headline text-red-400">Delete Page?</h3>
            </div>
            <p className="text-13 text-slate-300 mb-4">
              You are about to delete <strong>{String(nodeToDeleteData.data.label)}</strong>.
            </p>
            {nodeToDeleteData.data.isCritical ? (
              <div className="bg-red-500/10 border border-red-500/20 p-3 rounded text-12 text-red-200 mb-6">
                <strong>CRITICAL PAGE WARNING:</strong> Deleting this page will severely impact the application&apos;s architecture. It may break routing, authentication flows, or core data relationships. Proceed with extreme caution.
              </div>
            ) : null}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => { setShowDeleteConfirm(false); setNodeToDelete(null); }} className="px-4 py-2 rounded text-13 text-slate-400 hover:bg-white/5 transition-colors">
                Cancel
              </button>
              <button type="button" onClick={confirmDelete} className="px-4 py-2 rounded text-13 bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors">
                Delete Page
              </button>
            </div>
          </div>
        </div>
      )}

      {editingNodeId ? (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#040f1a] border border-white/10 p-6 rounded-lg max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-headline text-cyan-300 mb-4">Edit page</h3>
            <label className="block text-12 text-slate-500 mb-1">Name</label>
            <input
              type="text"
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-13 text-white focus:outline-none focus:border-cyan-500/50 mb-3"
            />
            <label className="block text-12 text-slate-500 mb-1">Description</label>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={3}
              className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-13 text-white focus:outline-none focus:border-cyan-500/50 mb-6 resize-y"
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingNodeId(null)}
                className="px-4 py-2 rounded text-13 text-slate-400 hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                className="px-4 py-2 rounded text-13 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showAddModal && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#040f1a] border border-white/10 p-6 rounded-lg shadow-2xl max-w-sm w-full">
            <h3 className="text-lg font-headline text-cyan-300 mb-4">Add New Page</h3>
            <input
              type="text"
              value={newPageName}
              onChange={(e) => setNewPageName(e.target.value)}
              placeholder="Page Name (e.g., User Profile)"
              className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-13 text-white focus:outline-none focus:border-cyan-500/50 mb-6"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleAddNode()}
            />
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 rounded text-13 text-slate-400 hover:bg-white/5 transition-colors">
                Cancel
              </button>
              <button type="button" onClick={handleAddNode} className="px-4 py-2 rounded text-13 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 transition-colors">
                Add Page
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function NebullaWorkspaceMindMap({
  pages,
  setPages,
  edges,
  setEdges,
  onSaveToMasterPlan,
}: {
  pages: Node[];
  setPages: React.Dispatch<React.SetStateAction<Node[]>>;
  edges: Edge[];
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  onSaveToMasterPlan: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="flex flex-col flex-1 min-h-0 w-full">
      <ReactFlowProvider>
        <div className={collapsed ? "flex flex-col shrink-0" : "flex flex-col flex-1 min-h-0"}>
          <MindMapFlowInner
            pages={pages}
            setPages={setPages}
            edges={edges}
            setEdges={setEdges}
            onSaveToMasterPlan={onSaveToMasterPlan}
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed((c) => !c)}
          />
        </div>
      </ReactFlowProvider>
    </div>
  );
}
