import { useDebouncedCallback } from "@/hooks/use-debounced-callback"
import {
  addEdge,
  Background,
  Controls,
  getConnectedEdges,
  getIncomers,
  getOutgoers,
  MiniMap,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react"
import { useOptimisticAction } from "next-safe-action/hooks"
import { useCallback, useEffect, type MouseEvent } from "react"
import { updateDraftFlowVersionAction } from "../actions/update-draft-flow-version-action"
import type { FlowVersionResource } from "../schemas/get-flows-schema"
import { AddNodeButton } from "./nodes/add-node"
import { NodeViewer } from "./nodes/viewer"
import { NodeType, type FlowNode } from "./types"

const nodeTypes = {
  [NodeType.SendMessage]: NodeViewer,
  [NodeType.AddNotes]: NodeViewer,
  [NodeType.Wait]: NodeViewer,
  [NodeType.StartFlow]: NodeViewer,
}

interface ReactFlowFrameProps {
  flowVersion: FlowVersionResource
  setOpenNodeDetailSheet: (open: boolean) => void
}

export function ReactFlowWrapper({
  flowVersion,
  setOpenNodeDetailSheet,
}: ReactFlowFrameProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(
    flowVersion.nodes as unknown as FlowNode[],
  )
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    flowVersion.edges as unknown as Edge[],
  )

  const { execute: savingDraft } = useOptimisticAction(
    updateDraftFlowVersionAction.bind(
      null,
      flowVersion.chatbotId,
      flowVersion.id,
    ),
    {
      currentState: { flowVersion },
      updateFn: (state, updatedData) => {
        return {
          flowVersion: {
            ...state.flowVersion,
            ...updatedData,
          },
        }
      },
    },
  )

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  const handleChanges = useDebouncedCallback((nodes: any[], edges: any[]) => {
    savingDraft({ nodes, edges })
  }, 1000)

  useEffect(() => {
    handleChanges(nodes, edges)
  }, [nodes, edges, handleChanges])

  const handleNodeClick = useCallback(() => {
    setOpenNodeDetailSheet(true)
  }, [setOpenNodeDetailSheet])

  const handlePaneClick = useCallback(() => {
    setOpenNodeDetailSheet(false)
  }, [setOpenNodeDetailSheet])

  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      setEdges(
        deleted.reduce((acc, node) => {
          const incomers = getIncomers(node, nodes, edges)
          const outgoers = getOutgoers(node, nodes, edges)
          const connectedEdges = getConnectedEdges([node], edges)

          const remainingEdges = acc.filter(
            (edge: Edge) => !connectedEdges.includes(edge),
          )

          const createdEdges = incomers.flatMap(({ id: source }) =>
            outgoers.map(({ id: target }) => ({
              id: `${source}->${target}`,
              source,
              target,
            })),
          )

          return [...remainingEdges, ...createdEdges]
        }, edges),
      )
    },
    [nodes, edges, setEdges],
  )

  const onNodeMouseEnter = useCallback(
    (_: MouseEvent, node: Node) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === node.id
            ? { ...n, data: { ...n.data, forceToolbarVisible: true } }
            : n,
        ),
      )
    },
    [setNodes],
  )
  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  )

  const onNodeMouseLeave = useCallback(
    (_: MouseEvent, node: Node) => {
      setTimeout(() => {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === node.id
              ? { ...n, data: { ...n.data, forceToolbarVisible: false } }
              : n,
          ),
        )
      }, 100)
    },
    [setNodes],
  )

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodesDelete={onNodesDelete}
      onConnect={onConnect}
      onNodeMouseEnter={onNodeMouseEnter}
      onNodeMouseLeave={onNodeMouseLeave}
      nodeTypes={nodeTypes}
      proOptions={{ hideAttribution: true }}
      onNodeClick={handleNodeClick}
      onPaneClick={handlePaneClick}
    >
      <MiniMap />
      <Background />
      <Panel position="bottom-center">
        <Controls orientation="horizontal">
          <AddNodeButton />
        </Controls>
      </Panel>
    </ReactFlow>
  )
}
