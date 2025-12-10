import {
  type FlowNode,
  NodeType,
  sendMessageNodeDefaultFn,
} from "@aha.chat/flow-config"
import { useDebouncedCallback } from "@aha.chat/ui/hooks/use-debounced-callback"
import {
  addEdge,
  Background,
  type Connection,
  Controls,
  type Edge,
  type FinalConnectionState,
  getConnectedEdges,
  getIncomers,
  getOutgoers,
  MiniMap,
  type Node,
  type OnConnectStartParams,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react"
import { useOptimisticAction } from "next-safe-action/hooks"
import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useRef,
} from "react"
import { updateDraftFlowVersionAction } from "../actions/update-draft-flow-version-action"
import type { FlowVersionResource } from "../schemas/get-flows-schema"
import { NodeViewer } from "./nodes/viewer"
import AddNodeButton from "./panel-buttons/add-node-button"
import FocusButton from "./panel-buttons/focus-button"
import ZoomInButton from "./panel-buttons/zoom-in-button"
import ZoomOutButton from "./panel-buttons/zoom-out-button"
import "./react-flow-wrapper.css"
import { createId } from "@paralleldrive/cuid2"
import DeleteEdge from "./edges/delete-edge"

const nodeTypes = {
  [NodeType.sendMessage]: NodeViewer,
  [NodeType.performAction]: NodeViewer,
  [NodeType.addNotes]: NodeViewer,
  [NodeType.wait]: NodeViewer,
  [NodeType.startFlow]: NodeViewer,
}

const edgeTypes = {
  delete: DeleteEdge,
}

type ReactFlowFrameProps = {
  flowVersion: FlowVersionResource
  setOpenNodeDetailSheet: (open: boolean) => void
}

export function ReactFlowWrapper({
  flowVersion,
  setOpenNodeDetailSheet,
}: ReactFlowFrameProps) {
  const reactFlow = useReactFlow()

  const [nodes, setNodes, onNodesChange] = useNodesState(
    flowVersion.nodes as unknown as FlowNode[],
  )
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    (flowVersion.edges as unknown as Edge[]).map((edge) => ({
      ...edge,
      type: "delete",
      data: {
        ...edge.data,
        onDelete: (edgeId: string) => {
          setEdges((eds) => eds.filter((e) => e.id !== edgeId))
        },
      },
    })),
  )
  const connectNodeRef = useRef<{ nodeId: string } | null>(null)

  const { execute: savingDraft } = useOptimisticAction(
    updateDraftFlowVersionAction.bind(
      null,
      flowVersion.chatbotId,
      flowVersion.id,
    ),
    {
      currentState: { flowVersion },
      updateFn: (state, updatedData) => ({
        flowVersion: {
          ...state.flowVersion,
          nodes: JSON.parse(JSON.stringify(updatedData.nodes)),
          edges: JSON.parse(JSON.stringify(updatedData.edges)),
        },
      }),
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
      setEdges((prevEdges) => {
        const nextEdges = deleted.reduce<typeof prevEdges>((acc, node) => {
          const incomers = getIncomers(node, nodes, prevEdges)
          const outgoers = getOutgoers(node, nodes, prevEdges)
          const connectedEdges = getConnectedEdges([node], prevEdges)

          const remainingEdges = acc.filter(
            (edge) => !connectedEdges.some((e) => e.id === edge.id),
          )

          const createdEdges = incomers.flatMap(({ id: source }) =>
            outgoers.map(({ id: target }) => ({
              id: `${source}->${target}`,
              source,
              target,
              type: "delete",
              data: {
                onDelete: (edgeId: string) => {
                  setEdges((eds) => eds.filter((e) => e.id !== edgeId))
                },
              },
            })),
          )

          return [...remainingEdges, ...createdEdges]
        }, prevEdges)

        return nextEdges
      })
    },
    [nodes, setEdges],
  )

  const onNodeMouseEnter = useCallback(
    (_: ReactMouseEvent, node: Node) => {
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
    (params: Connection) =>
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: "delete",
            data: {
              onDelete: (edgeId: string) => {
                setEdges((items) => items.filter((e) => e.id !== edgeId))
              },
            },
          },
          eds,
        ),
      ),
    [setEdges],
  )

  const onNodeMouseLeave = useCallback(
    (_: ReactMouseEvent, node: Node) => {
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

  const onConnectStart = useCallback(
    (_: MouseEvent | TouchEvent, params: OnConnectStartParams) => {
      connectNodeRef.current = {
        nodeId: params.nodeId || "",
      }
    },
    [],
  )

  const onConnectEnd = useCallback(
    (
      event: MouseEvent | TouchEvent,
      connectionState: FinalConnectionState,
    ): void => {
      const { addNodes, getNodes, getEdges, addEdges } = reactFlow
      const { fromHandle, toNode } = connectionState
      if (connectNodeRef.current && !toNode) {
        const allNodes = getNodes()
        const yBuffer = 30 // from top to handler
        const position = reactFlow.screenToFlowPosition({
          x: "touches" in event ? event.touches[0].clientX : event.clientX,
          y:
            "touches" in event
              ? event.touches[0].clientY
              : event.clientY - yBuffer,
        })

        let labelVersion = 1
        for (const node of allNodes) {
          if (node.type === NodeType.sendMessage) {
            labelVersion += 1
          }
        }

        const newNode = sendMessageNodeDefaultFn({
          name: `Send Message #${labelVersion}`,
          position,
        })
        addNodes([newNode])
        addEdges({
          id: createId(),
          source: connectNodeRef.current.nodeId,
          target: newNode.id,
          sourceHandle: fromHandle?.id,
          targetHandle: newNode.id,
          type: "delete",
        })
      } else {
        const existingEdges = getEdges()
        const updatedEdges = existingEdges.map((edge) => {
          if (
            edge.source === connectionState.fromNode?.id &&
            edge.target === connectionState.toNode?.id
          ) {
            return {
              ...edge,
              data: {
                ...edge.data,
                onDelete: (edgeId: string) => {
                  setEdges((eds) => eds.filter((e) => e.id !== edgeId))
                },
              },
            }
          }
          return edge
        })
        reactFlow.setEdges(updatedEdges)
      }
      connectNodeRef.current = null
    },
    [reactFlow, setEdges],
  )

  const onEdgeMouseEnter = (_: ReactMouseEvent, edge: Edge) => {
    const edgeId = edge.id

    // Updates edge
    reactFlow.updateEdge(edgeId, (oldEdge) => ({
      data: { ...oldEdge.data, isHovered: true },
    }))
  }

  const onEdgeMouseLeave = (_: ReactMouseEvent, edge: Edge) => {
    const edgeId = edge.id
    reactFlow.updateEdge(edgeId, (oldEdge) => ({
      data: { ...oldEdge.data, isHovered: false },
    }))
  }

  return (
    <ReactFlow
      defaultEdgeOptions={{
        markerEnd: {
          type: "arrowclosed",
        },
        style: {
          strokeWidth: 2,
        },
      }}
      edges={edges}
      edgeTypes={edgeTypes}
      nodes={nodes}
      nodeTypes={nodeTypes}
      onConnect={onConnect}
      onConnectEnd={onConnectEnd}
      onConnectStart={onConnectStart}
      onEdgeMouseEnter={onEdgeMouseEnter}
      onEdgeMouseLeave={onEdgeMouseLeave}
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
        <Controls
          className="overflow-hidden rounded-md"
          orientation="horizontal"
          showFitView={false}
          showInteractive={false}
          showZoom={false}
        >
          <FocusButton />
          <ZoomInButton />
          <ZoomOutButton />
          <AddNodeButton />
        </Controls>
      </Panel>
    </ReactFlow>
  )
}
