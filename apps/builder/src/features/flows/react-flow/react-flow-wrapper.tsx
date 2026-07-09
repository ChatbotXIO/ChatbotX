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
  type NodeChange,
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
import { serializeFlowContent } from "../flow-version-content"
import ButtonEdge from "./edges/button-edge"
import { hasMeaningfulNodeChange } from "./react-flow-node-change"
import { useFlowHistoryStoreApi } from "./stores/flow-history-store-provider"
import { useFlowHistory } from "./stores/use-flow-history"

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
  onAutosaveFlushChange: (flushAutosave: (() => void) | null) => void
  onAutosaveCancelChange: (cancelAutosave: (() => void) | null) => void
  onDraftDirtiedChange: (dirtied: boolean) => void
  onMarkSavedChange: (
    markSaved: ((nodes: Node[], edges: Edge[]) => void) | null,
  ) => void
}

export function ReactFlowWrapper({
  flowVersion,
  onAutosaveFlushChange,
  onAutosaveCancelChange,
  onDraftDirtiedChange,
  onMarkSavedChange,
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

  const [nodes, setNodes, onNodesChange] = useNodesState(
    flowVersion.nodes as unknown as FlowNode[],
  )
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    (flowVersion.edges as unknown as Edge[]).map((edge) => ({
      ...edge,
      type: "buttonedge",
      markerEnd: {
        type: MarkerType.ArrowClosed,
      },
    })),
  )
  const lastSavedSerializedRef = useRef(
    serializeFlowContent(
      flowVersion.nodes as unknown as FlowNode[],
      flowVersion.edges as unknown as Edge[],
    ),
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
    1500,
    4000,
  )

  const t = useTranslations()
  const [isFlowMutating, setIsFlowMutating] = useState(false)
  const isMutatingRef = useRef(false)
  const snapshotSessionRef = useRef(false)
  // Capture deliberately reads React Flow's internal store here. The restore
  // path writes through the controlled props so undo/redo stays out of
  // onNodesChange/onEdgesChange.
  const { takeSnapshot } = useFlowHistory()
  const historyStore = useFlowHistoryStoreApi()

  // Register the local state setters as the history store's restore handlers so
  // undo/redo write through the controlled nodes/edges props. React Flow's
  // StoreUpdater syncs those props into its internal store WITHOUT firing
  // onNodesChange/onEdgesChange, so restoring never re-enters the snapshot path.
  useEffect(() => {
    const restoreNodes = (restoredNodes: Node[]) =>
      setNodes(restoredNodes as unknown as FlowNode[])

    const restoreEdges = (restoredEdges: Edge[]) =>
      setEdges(
        restoredEdges.map((edge) => ({
          ...edge,
          type: "buttonedge",
          markerEnd: { type: MarkerType.ArrowClosed },
        })),
      )

    historyStore
      .getState()
      .setRestoreHandlers({ setNodes: restoreNodes, setEdges: restoreEdges })

    return () => historyStore.getState().setRestoreHandlers(null)
  }, [historyStore, setNodes, setEdges])

  const releaseSnapshotSession = useDebouncedCallback(() => {
    snapshotSessionRef.current = false
  }, 500)

  const takeCoalescedSnapshot = useCallback(() => {
    if (!snapshotSessionRef.current) {
      takeSnapshot()
      snapshotSessionRef.current = true
    }
    releaseSnapshotSession()
  }, [takeSnapshot, releaseSnapshotSession])

  // Snapshot first, then mutate React Flow's live node data. updateNodeData
  // writes directly into the internal store, so callers must preserve the
  // pre-mutation state before passing data in.
  const updateNodeDataWithHistory = useCallback(
    (nodeId: string, data: FlowNode["data"]) => {
      takeCoalescedSnapshot()
      updateNodeData(nodeId, data)
    },
    [takeCoalescedSnapshot, updateNodeData],
  )

  const hasMeaningfulEdgeChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) =>
      changes.some(
        (change) => change.type === "add" || change.type === "remove",
      ),
    [],
  )

  const handleNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      if (hasMeaningfulNodeChange(changes)) {
        takeCoalescedSnapshot()
      }
      onNodesChange(changes)
    },
    [onNodesChange, takeCoalescedSnapshot],
  )

  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      if (hasMeaningfulEdgeChange(changes)) {
        takeCoalescedSnapshot()
      }
      onEdgesChange(changes)
    },
    [hasMeaningfulEdgeChange, onEdgesChange, takeCoalescedSnapshot],
  )

  const handleNodeDragStart = useCallback(() => {
    takeCoalescedSnapshot()
  }, [takeCoalescedSnapshot])

  const handleNodeDragStop = useCallback(() => {
    releaseSnapshotSession()
  }, [releaseSnapshotSession])

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

  const duplicateNodeWithHistory = useCallback(
    async (sourceNode: FlowNode) => {
      takeSnapshot()
      await duplicateNode(sourceNode)
    },
    [duplicateNode, takeSnapshot],
  )

  const deleteNodeWithHistory = useCallback(
    async (nodeId: string) => {
      takeSnapshot()
      await deleteNode(nodeId)
    },
    [deleteNode, takeSnapshot],
  )

  const flowMutationValue = useMemo(
    () => ({
      deleteNode: deleteNodeWithHistory,
      duplicateNode: duplicateNodeWithHistory,
      isFlowMutating,
    }),
    [isFlowMutating, duplicateNodeWithHistory, deleteNodeWithHistory],
  )

  useEffect(() => {
    const serialized = serializeFlowContent(nodes, edges as Edge[])
    if (serialized === lastSavedSerializedRef.current) {
      return
    }

    lastSavedSerializedRef.current = serialized
    onDraftDirtiedChange(true)
    handleChanges(nodes, edges)
  }, [handleChanges, nodes, edges, onDraftDirtiedChange])

  const markSaved = useCallback(
    (savedNodes: Node[], savedEdges: Edge[]) => {
      lastSavedSerializedRef.current = serializeFlowContent(
        savedNodes,
        savedEdges,
      )
      onDraftDirtiedChange(false)
    },
    [onDraftDirtiedChange],
  )

  useEffect(() => {
    onAutosaveFlushChange(handleChanges.flush)
    onAutosaveCancelChange(handleChanges.cancel)
    onMarkSavedChange(markSaved)

    return () => {
      onAutosaveFlushChange(null)
      onAutosaveCancelChange(null)
      onMarkSavedChange(null)
    }
  }, [
    handleChanges.cancel,
    handleChanges.flush,
    markSaved,
    onAutosaveCancelChange,
    onAutosaveFlushChange,
    onMarkSavedChange,
  ])

  useEffect(
    () => () => {
      releaseSnapshotSession.cancel()
    },
    [releaseSnapshotSession],
  )

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
    (params: Connection) => {
      takeCoalescedSnapshot()
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: "buttonedge",
          },
          eds,
        ),
      )
    },
    [setEdges, takeCoalescedSnapshot],
  )

  const connectButtonToNode = useCallback(
    (connectionState: FinalConnectionState, toNodeId: string) => {
      if (!connectionState.fromNode) {
        return
      }

      takeCoalescedSnapshot()
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
        updateNodeDataWithHistory(fromNodeId, data)
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
            updateNodeDataWithHistory(fromNodeId, data)
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
    [takeCoalescedSnapshot, updateNodeDataWithHistory],
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
          takeCoalescedSnapshot()
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

            takeCoalescedSnapshot()
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
      takeCoalescedSnapshot,
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
      takeCoalescedSnapshot()

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
              updateNodeDataWithHistory(foundedNode.id, data)
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
                updateNodeDataWithHistory(foundedNode.id, data)
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
    [getNodes, takeCoalescedSnapshot, updateNodeDataWithHistory],
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
        onEdgesChange={handleEdgesChange}
        onEdgesDelete={onEdgesDelete}
        onNodeClick={handleNodeClick}
        onNodeDragStart={handleNodeDragStart}
        onNodeDragStop={handleNodeDragStop}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onNodesChange={handleNodesChange}
        onPaneClick={handlePaneClick}
        proOptions={{ hideAttribution: true }}
      >
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
