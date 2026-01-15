import {
  ButtonType,
  type FlowNode,
  NodeType,
  sendMessageNodeDefaultFn,
  startAnotherNodeStepDefaultFn,
} from "@aha.chat/flow-config"
import { useDebouncedCallback } from "@aha.chat/ui/hooks/use-debounced-callback"
import {
  addEdge,
  Background,
  type Connection,
  Controls,
  type Edge,
  type FinalConnectionState,
  MarkerType,
  type Node,
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
} from "react"
import { updateDraftFlowVersionAction } from "../actions/update-draft-flow-version-action"
import type { FlowVersionResource } from "../schemas/resource"
import { NodeViewer } from "./nodes/viewer"
import AddNodeButton from "./panel-buttons/add-node-button"
import FocusButton from "./panel-buttons/focus-button"
import ZoomInButton from "./panel-buttons/zoom-in-button"
import ZoomOutButton from "./panel-buttons/zoom-out-button"
import "./react-flow-wrapper.css"
import { createId } from "@paralleldrive/cuid2"
import type { ButtonProps } from "react-day-picker"
import ButtonEdge from "./edges/button-edge"

const nodeTypes = {
  [NodeType.sendMessage]: NodeViewer,
  [NodeType.performAction]: NodeViewer,
  [NodeType.addNotes]: NodeViewer,
  [NodeType.wait]: NodeViewer,
  [NodeType.startFlow]: NodeViewer,
}

const edgeTypes = {
  buttonedge: ButtonEdge,
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
  const {
    addNodes,
    getNodes,
    updateNodeData,
    addEdges,
    updateEdge,
    getEdges,
    deleteElements,
  } = reactFlow

  const [nodes, _setNodes, onNodesChange] = useNodesState(
    flowVersion.nodes as unknown as FlowNode[],
  )
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    (flowVersion.edges as unknown as Edge[]).map((edge) => ({
      ...edge,
      type: "buttonedge",
      markerEnd: {
        type: MarkerType.ArrowClosed,
      },
      // data: edge.data,
    })),
  )

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

  const onNodeMouseEnter = useCallback(
    (_event: ReactMouseEvent, node: Node) => {
      updateNodeData(node.id, { forceToolbarVisible: true })
    },
    [updateNodeData],
  )

  const onNodeMouseLeave = useCallback(
    (_event: ReactMouseEvent, node: Node) => {
      updateNodeData(node.id, { forceToolbarVisible: false })
    },
    [updateNodeData],
  )

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: "buttonedge",
          },
          eds,
        ),
      ),
    [setEdges],
  )

  const onConnectEnd = useCallback(
    (
      _event: MouseEvent | TouchEvent,
      connectionState: FinalConnectionState,
    ): void => {
      // cases:
      // 1. From node to empty space: create new sendMessage node
      // 2. From node to node: create new buttonedge
      // 3.

      // if from handle or from node is not set, return
      if (!(connectionState.fromHandle && connectionState.fromNode)) {
        return
      }

      // handle case of dragging from source handle
      if (connectionState.fromHandle.type === "source") {
        if (!(connectionState.toHandle && connectionState.toNode)) {
          const allNodes = getNodes()
          const messageNodesLength = allNodes.filter(
            (node) => node.type === NodeType.sendMessage,
          ).length

          const newNode = sendMessageNodeDefaultFn({
            nodeProps: {
              position: connectionState.to ?? {
                x: 300,
                y: 300,
              },
            },
            dataProps: {
              name: `Send Message #${messageNodesLength + 1}`,
            },
          })
          addNodes([newNode])

          addEdges({
            id: createId(),
            source: connectionState.fromNode.id,
            target: newNode.id,
            sourceHandle: connectionState.fromHandle.id,
            targetHandle: newNode.id,
            type: "buttonedge",
          })

          return
        }

        if (connectionState.toHandle && connectionState.toNode) {
          // if to node is the same as from node, return
          if (connectionState.toNode.id === connectionState.fromNode.id) {
            return
          }

          const allEdges = getEdges()

          // if it's already connected, return
          const isConnected = allEdges.some(
            (edge) =>
              edge.sourceHandle === connectionState.fromHandle?.id &&
              edge.targetHandle === connectionState.toHandle?.id,
          )
          if (isConnected) {
            return
          }

          // this connection is from node to node, so we need to create a new buttonedge
          if (connectionState.toHandle.id === connectionState.toNode.id) {
            // Each source handle just can connect to one target handle
            // Remove the existing edges that have the same source handle
            const connectedEdges = allEdges.filter(
              (edge) => edge.sourceHandle === connectionState.fromHandle?.id,
            )

            deleteElements({
              edges: connectedEdges.map((edge) => ({
                id: edge.id,
              })),
            })

            // if the handle is from button, update the button data
            if (connectionState.fromHandle.id !== connectionState.fromNode.id) {
              const data = connectionState.fromNode.data as FlowNode["data"]

              if (data.details && "steps" in data.details) {
                // biome-ignore lint/style/useForOf: safe to use for of
                for (
                  let stepIndex = 0;
                  stepIndex < data.details.steps.length;
                  stepIndex++
                ) {
                  if ("buttons" in data.details.steps[stepIndex]) {
                    const buttonIndex =
                      // biome-ignore lint/suspicious/noExplicitAny: safe to use any
                      (data.details.steps[stepIndex] as any).buttons.findIndex(
                        (button: ButtonProps) =>
                          button.id === connectionState.fromHandle?.id,
                      )

                    if (buttonIndex !== -1) {
                      const targetButton =
                        // biome-ignore lint/suspicious/noExplicitAny: safe to use any
                        (data.details.steps[stepIndex] as any).buttons[
                          buttonIndex
                        ]
                      targetButton.buttonType = ButtonType.StartAnotherNode
                      targetButton.beforeStep = startAnotherNodeStepDefaultFn({
                        nodeId: connectionState.toNode.id,
                        viewOnly: true,
                      })

                      // biome-ignore lint/suspicious/noExplicitAny: safe to use any
                      ;(data.details.steps[stepIndex] as any).buttons[
                        buttonIndex
                      ] = targetButton

                      updateNodeData(connectionState.fromNode.id, data)

                      break
                    }
                  }
                }
              }
            }
            return
          }

          return
        }

        return
      }
    },
    [addNodes, addEdges, getNodes, deleteElements, getEdges, updateNodeData],
  )

  const onEdgeMouseEnter = useCallback(
    (_event: ReactMouseEvent, edge: Edge) => {
      const edgeId = edge.id

      // Updates edge
      updateEdge(edgeId, (oldEdge) => ({
        data: { ...oldEdge.data, isHovered: true },
      }))
    },
    [updateEdge],
  )

  const onEdgeMouseLeave = useCallback(
    (_event: ReactMouseEvent, edge: Edge) => {
      const edgeId = edge.id
      updateEdge(edgeId, (oldEdge) => ({
        data: { ...oldEdge.data, isHovered: false },
      }))
    },
    [updateEdge],
  )

  return (
    <ReactFlow
      defaultEdgeOptions={{
        markerEnd: {
          type: MarkerType.ArrowClosed,
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
      onEdgeMouseEnter={onEdgeMouseEnter}
      onEdgeMouseLeave={onEdgeMouseLeave}
      onEdgesChange={onEdgesChange}
      onNodeClick={handleNodeClick}
      onNodeMouseEnter={onNodeMouseEnter}
      onNodeMouseLeave={onNodeMouseLeave}
      onNodesChange={onNodesChange}
      onPaneClick={handlePaneClick}
      proOptions={{ hideAttribution: true }}
    >
      {/* <MiniMap /> */}
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
