import { createId } from "@paralleldrive/cuid2";
import { type Edge, type Node, type NodeChange, type OnConnect, type OnEdgesChange, type OnNodesChange, addEdge, applyEdgeChanges, applyNodeChanges } from "@xyflow/react";
import { useCallback } from "react";
import { createStore } from "zustand";
import { allNodesConfig } from "../nodes/node-config";
import type { NodeData, NodeType } from "../types";
export type FlowNode = Node & {
  data: NodeData
}

export type FlowState = {
  nodes: FlowNode[];
  edges: Edge[];
  activeNode: FlowNode | null;
};

export type FlowActions = {
  initFlow: (nodes: FlowNode[], edges: Edge[]) => void

  setNodes: (nodes: FlowNode[]) => void;
  onNodesChange: OnNodesChange<FlowNode>;
  addNode: (nodeType: NodeType, data: Pick<FlowNode, "position" | "id">) => void
  updateNode: (id: string, node: FlowNode["data"]) => void
  removeNode: (id: string) => void
  setActiveNode: (node: FlowNode | null) => void
  removeBlock: (blockId: string) => void

  setEdges: (edges: Edge[]) => void;
  addEdge: (edge: Pick<Edge, "sourceHandle" | "targetHandle" | "source" | "target">) => void

  // onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
}

export type FlowStore = FlowState & FlowActions

export const createFlowStore = (
  initState: FlowState = {
    nodes: [],
    edges: [],
    activeNode: null,
  },
) => {
  return createStore<FlowStore>()((set, get) => ({
    ...initState,
    initialized: false,

    initFlow: (nodes, edges) => {
      set({ nodes, edges });
    },

    setNodes: (nodes) => {
      set({ nodes });
    },
    onNodesChange: (changes: NodeChange<FlowNode>[]) => {
      const nodes = get().nodes
      set({ nodes: applyNodeChanges(changes, nodes) })
    },
    addNode: (nodeType, data) => {
      const allNodes = get().nodes
      let labelVersion = 1
      for (const node of allNodes) {
        if (node.type === nodeType) {
          labelVersion++
        }
      }

      const targetNodeConfig = allNodesConfig.find((item) => item.type === nodeType)
      const newNode = targetNodeConfig?.defaultFn?.({
        labelVersion,
        ...data,
      })

      if (newNode) {
        set({ nodes: [...allNodes, newNode] })
      }
    },
    updateNode: (id, data) => {
      const nodes = get().nodes
      set({
        nodes: nodes.map((node) => {
          if (node.id === id) {
            return {
              ...node,
              data: {
                ...node.data,
                ...data,
              },
            }
          }
          return node
        }),
      })
    },
    removeNode: (id) => {
      const nodes = get().nodes
      set({
        nodes: nodes.filter((node) => node.id !== id),
      })
    },
    removeBlock: (blockId) => {
      const edges = get().edges
      set({
        edges: edges.filter((edge) => edge.sourceHandle !== blockId && edge.targetHandle !== blockId),
      })
    },

    setEdges: (edges) => {
      set({ edges });
    },
    addEdge: (edge) => {
      const edges = get().edges

      console.log({
        id: `xy-edge__${edge.source}-${edge.target}`,
        ...edge,
      })
      edges.push({
        id: `xy-edge__${edge.source}-${edge.target}`,
        ...edge,
      })
      set({
        edges
      })
    },
    setActiveNode: (node) => {
      set({ activeNode: node });
    },

    // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
    onEdgesChange: useCallback(
      (changes) => set({ edges: applyEdgeChanges(changes, get().edges) }),
      []
    ),
    onConnect: (connection) => {
      set({
        edges: addEdge(connection, get().edges),
      });
    },
  }))
}
