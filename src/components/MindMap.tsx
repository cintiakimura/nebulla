import React, { useState, useCallback, useRef } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Handle,
  Position,
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  Connection,
  Panel
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { v4 as uuidv4 } from 'uuid';

// Custom Node Component
const PageNode = ({ data, id }: any) => {
  return (
    <div className="px-4 py-2 shadow-lg rounded-md bg-[#040f1a] border border-cyan-500/30 min-w-[150px] relative group">
      <Handle type="target" position={Position.Left} className="w-2 h-2 bg-cyan-400" />
      <div className="flex justify-between items-center gap-4">
        <div className="flex flex-col">
          <span className="text-sm font-headline text-cyan-300">{data.label}</span>
          {data.isCreated ? (
            <a href={`#${data.label.toLowerCase().replace(/\s+/g, '-')}`} className="text-[10px] text-emerald-400 hover:underline flex items-center gap-1">
              <span className="material-symbols-outlined text-[12px]">link</span>
              Live Link
            </a>
          ) : (
            <span className="text-[10px] text-slate-500">Pending Creation</span>
          )}
        </div>
        <button 
          onClick={(e) => { e.stopPropagation(); data.onDelete(id); }}
          className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-opacity"
        >
          <span className="material-symbols-outlined text-14">delete</span>
        </button>
      </div>
      <Handle type="source" position={Position.Right} className="w-2 h-2 bg-cyan-400" />
    </div>
  );
};

const nodeTypes = { pageNode: PageNode };

export function MindMap({ pages, setPages, edges, setEdges, onSaveToMasterPlan }: any) {
  const [pendingChanges, setPendingChanges] = useState<NodeChange[] | null>(null);
  const [showDragConfirm, setShowDragConfirm] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newPageName, setNewPageName] = useState('');
  
  const initialNodesRef = useRef<Node[]>([]);

  // When a drag starts, record the current positions so we can revert if they say "No"
  const onNodeDragStart = useCallback((event: any, node: Node, nodes: Node[]) => {
    initialNodesRef.current = JSON.parse(JSON.stringify(pages));
  }, [pages]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Apply changes immediately for smooth dragging
      setPages((nds: Node[]) => applyNodeChanges(changes, nds));
      
      // Check if any change is a drag stop (position change finished)
      const isDragStop = changes.some(c => c.type === 'position' && !c.dragging);
      if (isDragStop) {
        setPendingChanges(changes);
        setShowDragConfirm(true);
      }
    },
    [setPages]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds: Edge[]) => applyEdgeChanges(changes, eds)),
    [setEdges]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds: Edge[]) => addEdge({ ...params, animated: true, style: { stroke: '#00ffff' } }, eds));
      onSaveToMasterPlan();
    },
    [setEdges, onSaveToMasterPlan]
  );

  const handleConfirmDrag = () => {
    setShowDragConfirm(false);
    setPendingChanges(null);
    onSaveToMasterPlan();
  };

  const handleCancelDrag = () => {
    setShowDragConfirm(false);
    setPendingChanges(null);
    // Revert to initial positions
    setPages(initialNodesRef.current);
  };

  const handleDeleteRequest = useCallback((id: string) => {
    setNodeToDelete(id);
    setShowDeleteConfirm(true);
  }, []);

  const confirmDelete = () => {
    if (nodeToDelete) {
      setPages((nds: Node[]) => nds.filter(n => n.id !== nodeToDelete));
      setEdges((eds: Edge[]) => eds.filter(e => e.source !== nodeToDelete && e.target !== nodeToDelete));
      onSaveToMasterPlan();
    }
    setShowDeleteConfirm(false);
    setNodeToDelete(null);
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setNodeToDelete(null);
  };

  const handleAddNode = () => {
    if (!newPageName.trim()) return;
    const newNode: Node = {
      id: uuidv4(),
      type: 'pageNode',
      position: { x: Math.random() * 200 + 800, y: 250 + (Math.random() * 100 - 50) },
      data: { 
        label: newPageName, 
        isCritical: false, 
        isCreated: false, 
        description: 'New page added via Mind Map.',
        onDelete: handleDeleteRequest
      }
    };
    setPages((nds: Node[]) => [...nds, newNode]);
    setNewPageName('');
    setShowAddModal(false);
    onSaveToMasterPlan();
  };

  // Inject onDelete into node data
  const nodesWithCallbacks = pages.map((node: Node) => ({
    ...node,
    data: { ...node.data, onDelete: handleDeleteRequest }
  }));

  const nodeToDeleteData = pages.find((n: Node) => n.id === nodeToDelete);

  return (
    <div className="w-full h-full relative bg-[#020810] rounded-md overflow-hidden border border-white/5 shadow-2xl">
      <ReactFlow
        nodes={nodesWithCallbacks}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStart={onNodeDragStart}
        nodeTypes={nodeTypes}
        fitView
        className="bg-transparent"
        colorMode="dark"
      >
        <Background color="#00ffff" gap={16} size={1} />
        <Controls className="bg-[#040f1a] border border-white/10 fill-cyan-300 text-cyan-300" />
        <Panel position="top-left" className="m-4">
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 rounded-md text-13 font-headline hover:bg-cyan-500/20 transition-all shadow-[0_0_10px_rgba(0,255,255,0.1)]"
          >
            <span className="material-symbols-outlined text-14">add</span>
            Add Page
          </button>
        </Panel>
      </ReactFlow>

      {/* Drag Confirm Modal */}
      {showDragConfirm && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#040f1a] border border-white/10 p-6 rounded-lg shadow-2xl max-w-sm w-full">
            <h3 className="text-lg font-headline text-cyan-300 mb-2">Confirm Flow Change</h3>
            <p className="text-13 text-slate-300 mb-6">Are you sure you want to make this change? This will update the Master Plan.</p>
            <div className="flex justify-end gap-3">
              <button onClick={handleCancelDrag} className="px-4 py-2 rounded text-13 text-slate-400 hover:bg-white/5 transition-colors">No, Undo</button>
              <button onClick={handleConfirmDrag} className="px-4 py-2 rounded text-13 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 transition-colors">Yes, Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {showDeleteConfirm && nodeToDeleteData && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#040f1a] border border-red-500/30 p-6 rounded-lg shadow-2xl max-w-sm w-full">
            <div className="flex items-center gap-3 mb-2">
              <span className="material-symbols-outlined text-red-400 text-24">warning</span>
              <h3 className="text-lg font-headline text-red-400">Delete Page?</h3>
            </div>
            <p className="text-13 text-slate-300 mb-4">
              You are about to delete <strong>{nodeToDeleteData.data.label}</strong>.
            </p>
            {nodeToDeleteData.data.isCritical && (
              <div className="bg-red-500/10 border border-red-500/20 p-3 rounded text-12 text-red-200 mb-6">
                <strong>CRITICAL PAGE WARNING:</strong> Deleting this page will severely impact the application's architecture. It may break routing, authentication flows, or core data relationships. Proceed with extreme caution.
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button onClick={cancelDelete} className="px-4 py-2 rounded text-13 text-slate-400 hover:bg-white/5 transition-colors">Cancel</button>
              <button onClick={confirmDelete} className="px-4 py-2 rounded text-13 bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors">Delete Page</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Page Modal */}
      {showAddModal && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#040f1a] border border-white/10 p-6 rounded-lg shadow-2xl max-w-sm w-full">
            <h3 className="text-lg font-headline text-cyan-300 mb-4">Add New Page</h3>
            <input 
              type="text" 
              value={newPageName}
              onChange={e => setNewPageName(e.target.value)}
              placeholder="Page Name (e.g., User Profile)"
              className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-13 text-white focus:outline-none focus:border-cyan-500/50 mb-6"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleAddNode()}
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 rounded text-13 text-slate-400 hover:bg-white/5 transition-colors">Cancel</button>
              <button onClick={handleAddNode} className="px-4 py-2 rounded text-13 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 transition-colors">Add Page</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
