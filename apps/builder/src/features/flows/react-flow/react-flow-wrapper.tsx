import { type FlowNode, NodeType } from "@aha.chat/flow-config"
import { useDebouncedCallback } from "@aha.chat/ui/hooks/use-debounced-callback"
import {
  addEdge,
  Background,
  type Connection,
  Controls,
  type Edge,
  getConnectedEdges,
  getIncomers,
  getOutgoers,
  MiniMap,
  type Node,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react"
import { useOptimisticAction } from "next-safe-action/hooks"
import { type MouseEvent, useCallback, useEffect } from "react"
import { updateDraftFlowVersionAction } from "../actions/update-draft-flow-version-action"
import type { FlowVersionResource } from "../schemas/get-flows-schema"
import { AddNodeButton } from "./nodes/add-node"
import { NodeViewer } from "./nodes/viewer"

const nodeTypes = {
  [NodeType.SendMessage]: NodeViewer,
  [NodeType.AddNotes]: NodeViewer,
  [NodeType.Wait]: NodeViewer,
  [NodeType.StartFlow]: NodeViewer,
}

type ReactFlowFrameProps = {
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

  const handleChanges = useDebouncedCallback(
    // biome-ignore lint/suspicious/noExplicitAny: wip
    (changedNodes: any[], changedEdges: any[]) => {
      savingDraft({ nodes: changedNodes, edges: changedEdges })
    },
    1000,
  )

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
      setNodes((nds) =>
        nds.map((n) =>
          n.id === node.id
            ? { ...n, data: { ...n.data, forceToolbarVisible: false } }
            : n,
        ),
      )
    },
    [setNodes],
  )

  return (
    <ReactFlow
      edges={edges}
      nodes={nodes}
      nodeTypes={nodeTypes}
      onConnect={onConnect}
      onEdgesChange={onEdgesChange}
      onNodeClick={handleNodeClick}
      onNodeMouseEnter={onNodeMouseEnter}
      onNodeMouseLeave={onNodeMouseLeave}
      onNodesChange={onNodesChange}
      onNodesDelete={onNodesDelete}
      onPaneClick={handlePaneClick}
      proOptions={{ hideAttribution: true }}
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
