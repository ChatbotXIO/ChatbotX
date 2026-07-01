import {
  buttonTypes,
  type EmailStepSchema,
  type FlowNode,
  nodeTypeSchema,
  type PageElementSchema,
  pageElementTypes,
  sendMessageNodeDefaultFn,
  startAnotherNodeStepDefaultFn,
} from "@chatbotx.io/flow-config"
import { useDebouncedCallback } from "@chatbotx.io/ui/hooks/use-debounced-callback"
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
import { useTranslations } from "next-intl"
import { useOptimisticAction } from "next-safe-action/hooks"
import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { toast } from "sonner"
import { updateDraftFlowVersionAction } from "../actions/update-draft-flow-version-action"
import type { UpdateDraftFlowVersionSchema } from "../schemas/action"
import {
  createDeleteNode,
  type DeleteSaveResult,
} from "./delete-node-orchestrator"
import {
  createDuplicateNode,
  type DuplicateSaveResult,
} from "./duplicate-node-orchestrator"
import { FlowMutationProvider } from "./flow-mutation-context"
import { NodeViewer } from "./nodes/viewer"
import AddNodeButton from "./panel-buttons/add-node-button"
import FocusButton from "./panel-buttons/focus-button"
import ZoomInButton from "./panel-buttons/zoom-in-button"
import ZoomOutButton from "./panel-buttons/zoom-out-button"
import { duplicateFlowNode } from "./toolbar/duplicate-node-data"
import "./react-flow-wrapper.css"
import { createId } from "@chatbotx.io/utils"
import type { ButtonProps } from "react-day-picker"
import type { FlowVersionResource } from "@/features/flow-versions/schema/resource"
import ButtonEdge from "./edges/button-edge"

const viewerNodeTypes = {
  [nodeTypeSchema.enum.sendMessage]: NodeViewer,
  [nodeTypeSchema.enum.sendMail]: NodeViewer,
  [nodeTypeSchema.enum.landingPage]: NodeViewer,
  [nodeTypeSchema.enum.performAction]: NodeViewer,
  [nodeTypeSchema.enum.addNotes]: NodeViewer,
  [nodeTypeSchema.enum.wait]: NodeViewer,
  [nodeTypeSchema.enum.startFlow]: NodeViewer,
  [nodeTypeSchema.enum.splitTraffic]: NodeViewer,
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
    screenToFlowPosition,
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

  const { execute: savingDraft, executeAsync: savingDraftAsync } =
    useOptimisticAction(
      updateDraftFlowVersionAction.bind(
        null,
        flowVersion.workspaceId,
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

  const t = useTranslations()
  const [isFlowMutating, setIsFlowMutating] = useState(false)
  const isMutatingRef = useRef(false)

  const duplicateNode = useMemo(
    () =>
      createDuplicateNode({
        isMutatingRef,
        setIsFlowMutating,
        cancelAutosave: () => handleChanges.cancel(),
        getNodes: () => getNodes() as unknown as FlowNode[],
        getEdges,
        cloneNode: duplicateFlowNode,
        addNodes,
        // The action input schema types `nodes` as `any[]` (FlowNode[] flows in
        // freely) and `edges` as the zod edge schema, so only `edges` needs a cast.
        // The resolved result is cast to the orchestrator's narrow `DuplicateSaveResult`.
        saveDraft: async (input) =>
          (await savingDraftAsync({
            nodes: input.nodes,
            edges:
              input.edges as unknown as UpdateDraftFlowVersionSchema["edges"],
          })) as DuplicateSaveResult,
        onError: () => toast.error(t("messages.duplicateNodeError")),
      }),
    [getNodes, getEdges, addNodes, handleChanges, savingDraftAsync, t],
  )

  const deleteNode = useMemo(
    () =>
      createDeleteNode({
        isMutatingRef,
        setIsFlowMutating,
        cancelAutosave: () => handleChanges.cancel(),
        deleteElements,
        getNodes: () => getNodes() as unknown as FlowNode[],
        getEdges,
        saveDraft: async (input) =>
          (await savingDraftAsync({
            nodes: input.nodes,
            edges:
              input.edges as unknown as UpdateDraftFlowVersionSchema["edges"],
          })) as DeleteSaveResult,
        onError: () => toast.error(t("messages.deleteNodeError")),
      }),
    [getNodes, getEdges, deleteElements, handleChanges, savingDraftAsync, t],
  )

  const flowMutationValue = useMemo(
    () => ({ isFlowMutating, duplicateNode, deleteNode }),
    [isFlowMutating, duplicateNode, deleteNode],
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

  const connectButtonToNode = useCallback(
    (connectionState: FinalConnectionState, toNodeId: string) => {
      if (!connectionState.fromNode) {
        return
      }

      const fromNodeId = connectionState.fromNode.id
      const handleId = connectionState.fromHandle?.id
      const data = connectionState.fromNode.data as FlowNode["data"]

      // biome-ignore lint/suspicious/noExplicitAny: safe to use any
      function connectButtonsInStep(step: any): boolean {
        const buttonIndex = (step.buttons as ButtonProps[]).findIndex(
          (button: ButtonProps) => button.id === handleId,
        )
        if (buttonIndex === -1) {
          return false
        }

        const targetButton = step.buttons[buttonIndex]
        targetButton.buttonType = buttonTypes.enum.startAnotherNode
        targetButton.beforeStep = startAnotherNodeStepDefaultFn({
          nodeId: toNodeId,
          viewOnly: true,
        })
        step.buttons[buttonIndex] = targetButton
        updateNodeData(fromNodeId, data)
        return true
      }

      function connectElementsInStep(step: EmailStepSchema): boolean {
        const elements = step.elements as PageElementSchema[]
        for (
          let elementIndex = 0;
          elementIndex < elements.length;
          elementIndex++
        ) {
          const element = elements[elementIndex]
          if (
            element.type === pageElementTypes.enum.button &&
            element.beforeStep &&
            element.beforeStep.id === handleId
          ) {
            element.beforeStep.stepType = buttonTypes.enum.startAnotherNode
            element.beforeStep = startAnotherNodeStepDefaultFn({
              nodeId: toNodeId,
              viewOnly: true,
            })
            elements[elementIndex] = element
            updateNodeData(fromNodeId, data)
            return true
          }
        }
        return false
      }

      if ("steps" in data.details) {
        for (const step of data.details.steps as EmailStepSchema[]) {
          if ("buttons" in step && connectButtonsInStep(step)) {
            break
          }

          if ("elements" in step && connectElementsInStep(step)) {
            return
          }
        }
      }
    },
    [updateNodeData],
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
        // drop connection to empty space
        if (!(connectionState.toHandle && connectionState.toNode)) {
          const allNodes = getNodes()
          const messageNodesLength = allNodes.filter(
            (node) => node.type === nodeTypeSchema.enum.sendMessage,
          ).length

          const position = connectionState.to
            ? screenToFlowPosition(connectionState.to)
            : { x: 300, y: 300 }
          const newNode = sendMessageNodeDefaultFn({
            nodeProps: {
              position,
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

          // if the source is button, update the button data
          if (connectionState.fromHandle.id !== connectionState.fromNode.id) {
            connectButtonToNode(connectionState, newNode.id)
          }

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
              connectButtonToNode(connectionState, connectionState.toNode.id)
            }
            return
          }

          return
        }

        return
      }
    },
    [
      addNodes,
      addEdges,
      getNodes,
      deleteElements,
      getEdges,
      connectButtonToNode,
      screenToFlowPosition,
    ],
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

  const onEdgesDelete = useCallback(
    (edges: Edge[]) => {
      for (const edge of edges) {
        // if the edge is from node to node, do nothing
        if (edge.source === edge.sourceHandle) {
          continue
        }

        // the edge is from button to node, we need to update the button data
        const foundedNode = getNodes().find((node) => node.id === edge.source)
        if (!foundedNode) {
          continue
        }

        const data = foundedNode.data as FlowNode["data"]
        if ("details" in data && data.details && "steps" in data.details) {
          const stepIndex = data.details.steps.findIndex(
            (step) =>
              "buttons" in step &&
              step.buttons.some((button) => button.id === edge.sourceHandle),
          )
          if (stepIndex !== -1 && "buttons" in data.details.steps[stepIndex]) {
            const buttonIndex = data.details.steps[stepIndex].buttons.findIndex(
              (button: ButtonProps) => button.id === edge.sourceHandle,
            )
            if (buttonIndex !== -1) {
              data.details.steps[stepIndex].buttons[buttonIndex].beforeStep =
                null
              data.details.steps[stepIndex].buttons[buttonIndex].buttonType =
                null

              // update the node data
              updateNodeData(foundedNode.id, data)
            }
            continue
          }

          // Handle button page elements in steps (e.g. SendMail node)
          let elementFound = false
          for (const step of data.details.steps) {
            if (!("elements" in step)) {
              continue
            }
            for (const element of (step as EmailStepSchema).elements) {
              if (
                element.type === pageElementTypes.enum.button &&
                element.beforeStep &&
                element.beforeStep.id === edge.sourceHandle
              ) {
                Object.assign(element, { buttonType: null, beforeStep: null })
                updateNodeData(foundedNode.id, data)
                elementFound = true
                break
              }
            }
            if (elementFound) {
              break
            }
          }
        }
      }
    },
    [getNodes, updateNodeData],
  )

  return (
    <FlowMutationProvider value={flowMutationValue}>
      <ReactFlow
        defaultEdgeOptions={{
          markerEnd: {
            type: MarkerType.ArrowClosed,
          },
          style: {
            strokeWidth: 2,
          },
        }}
        deleteKeyCode={isFlowMutating ? null : undefined}
        edges={edges}
        edgeTypes={edgeTypes}
        elementsSelectable={!isFlowMutating}
        maxZoom={10}
        minZoom={0.1}
        nodes={nodes}
        nodesConnectable={!isFlowMutating}
        nodesDraggable={!isFlowMutating}
        nodeTypes={viewerNodeTypes}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onEdgeMouseEnter={onEdgeMouseEnter}
        onEdgeMouseLeave={onEdgeMouseLeave}
        onEdgesChange={onEdgesChange}
        onEdgesDelete={onEdgesDelete}
        onNodeClick={handleNodeClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onNodesChange={onNodesChange}
        onPaneClick={handlePaneClick}
        proOptions={{ hideAttribution: true }}
      >
        {/* <MiniMap /> */}
        {isFlowMutating && (
          <div
            className="absolute inset-0 z-50 cursor-wait bg-white/40 dark:bg-black/40"
            data-testid="flow-mutation-overlay"
          />
        )}
        <Background />
        <Panel className="w-[254px]" position="bottom-center">
          <Controls
            className="overflow-hidden rounded-md shadow-none!"
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
    </FlowMutationProvider>
  )
}
