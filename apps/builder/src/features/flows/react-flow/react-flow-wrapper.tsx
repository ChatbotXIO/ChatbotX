import {
  applyRouteUpdatesInNodes,
  type FlowNode,
  type FlowRouteUpdate,
  nodeTypeSchema,
  sendMessageNodeDefaultFn,
} from "@chatbotx.io/flow-config"
import { useDebouncedCallback } from "@chatbotx.io/ui/hooks/use-debounced-callback"
import {
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
import type { FlowVersionResource } from "@/features/flow-versions/schema/resource"
import { serializeFlowContent } from "../flow-version-content"
import {
  getRoutableHandleId,
  replaceSourceHandleEdge,
  toRouteRemovals,
} from "./edge-routing"
import ButtonEdge from "./edges/button-edge"
import { findNodeAtPoint } from "./node-hit-test"
import { hasMeaningfulNodeChange } from "./react-flow-node-change"
import { useFlowHistoryStoreApi } from "./stores/flow-history-store-provider"
import { useFlowHistory } from "./stores/use-flow-history"

function getClientPosition(event: MouseEvent | TouchEvent) {
  if ("changedTouches" in event) {
    const touch = event.changedTouches[0]
    return touch ? { x: touch.clientX, y: touch.clientY } : null
  }

  return { x: event.clientX, y: event.clientY }
}

const viewerNodeTypes = {
  [nodeTypeSchema.enum.sendMessage]: NodeViewer,
  [nodeTypeSchema.enum.sendMail]: NodeViewer,
  [nodeTypeSchema.enum.landingPage]: NodeViewer,
  [nodeTypeSchema.enum.performAction]: NodeViewer,
  [nodeTypeSchema.enum.addNotes]: NodeViewer,
  [nodeTypeSchema.enum.wait]: NodeViewer,
  [nodeTypeSchema.enum.followUp]: NodeViewer,
  [nodeTypeSchema.enum.startFlow]: NodeViewer,
  [nodeTypeSchema.enum.splitTraffic]: NodeViewer,
  [nodeTypeSchema.enum.condition]: NodeViewer,
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
    getIntersectingNodes,
    updateNodeData,
    updateEdge,
    getEdges,
    deleteElements,
    screenToFlowPosition,
  } = reactFlow

  const [nodes, setNodes, onNodesChange] = useNodesState(
    flowVersion.nodes as unknown as FlowNode[],
  )
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
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
    (changedNodes: FlowNode[], changedEdges: Edge[]) => {
      savingDraft({
        nodes: changedNodes,
        edges: changedEdges as unknown as UpdateDraftFlowVersionSchema["edges"],
      })
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

  const applyButtonRoutes = useCallback(
    (routeUpdates: readonly FlowRouteUpdate[]) => {
      setNodes((currentNodes) =>
        applyRouteUpdatesInNodes(currentNodes, routeUpdates),
      )
    },
    [setNodes],
  )

  const onConnect = useCallback(
    (params: Connection) => {
      if (params.source === params.target) {
        return
      }

      takeCoalescedSnapshot()
      setEdges((currentEdges) =>
        replaceSourceHandleEdge(currentEdges, {
          ...params,
          type: "buttonedge",
        }),
      )

      const handleId = getRoutableHandleId(params.source, params.sourceHandle)
      if (handleId) {
        applyButtonRoutes([
          {
            sourceNodeId: params.source,
            handleId,
            route: { targetNodeId: params.target },
          },
        ])
      }
    },
    [applyButtonRoutes, setEdges, takeCoalescedSnapshot],
  )

  const onConnectEnd = useCallback(
    (
      event: MouseEvent | TouchEvent,
      connectionState: FinalConnectionState,
    ): void => {
      const fromHandle = connectionState.fromHandle
      const fromNode = connectionState.fromNode
      if (
        !(fromHandle?.id && fromNode) ||
        fromHandle.type !== "source" ||
        connectionState.toHandle ||
        connectionState.toNode
      ) {
        return
      }

      const fromHandleId = fromHandle.id
      // connectionState.to is pane-relative; screenToFlowPosition needs raw
      // viewport client coordinates, so derive them from the event itself.
      const clientPosition = getClientPosition(event)
      const position = clientPosition
        ? screenToFlowPosition(clientPosition)
        : { x: 300, y: 300 }

      const droppedOnNode = clientPosition
        ? findNodeAtPoint(getIntersectingNodes, position, fromNode.id)
        : undefined

      if (droppedOnNode) {
        takeCoalescedSnapshot()
        setEdges((currentEdges) =>
          replaceSourceHandleEdge(currentEdges, {
            id: createId(),
            source: fromNode.id,
            target: droppedOnNode.id,
            sourceHandle: fromHandleId,
            targetHandle: droppedOnNode.id,
            type: "buttonedge",
          }),
        )

        const routableHandleId = getRoutableHandleId(fromNode.id, fromHandleId)
        if (routableHandleId) {
          applyButtonRoutes([
            {
              sourceNodeId: fromNode.id,
              handleId: routableHandleId,
              route: { targetNodeId: droppedOnNode.id },
            },
          ])
        }
        return
      }

      const messageNodesLength = getNodes().filter(
        (node) => node.type === nodeTypeSchema.enum.sendMessage,
      ).length
      const newNode = sendMessageNodeDefaultFn({
        nodeProps: { position },
        dataProps: {
          name: `${t("actions.sendMessage")} #${messageNodesLength + 1}`,
        },
      })

      takeCoalescedSnapshot()
      addNodes([newNode])
      setEdges((currentEdges) =>
        replaceSourceHandleEdge(currentEdges, {
          id: createId(),
          source: fromNode.id,
          target: newNode.id,
          sourceHandle: fromHandleId,
          targetHandle: newNode.id,
          type: "buttonedge",
        }),
      )

      const handleId = getRoutableHandleId(fromNode.id, fromHandleId)
      if (handleId) {
        applyButtonRoutes([
          {
            sourceNodeId: fromNode.id,
            handleId,
            route: { targetNodeId: newNode.id },
          },
        ])
      }
    },
    [
      addNodes,
      getNodes,
      getIntersectingNodes,
      setEdges,
      applyButtonRoutes,
      screenToFlowPosition,
      takeCoalescedSnapshot,
      t,
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
      applyButtonRoutes(toRouteRemovals(edges))
    },
    [applyButtonRoutes, takeCoalescedSnapshot],
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
