"use client"

import { AddNodeButton } from "@/features/flows/react-flow/nodes/add-node"
import {
  Background,
  Controls,
  type Edge,
  MiniMap,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useOptimisticAction } from "next-safe-action/hooks"
import { useEffect } from "react"
import { useDebouncedCallback } from "use-debounce"
import { updateDraftFlowVersionAction } from "../actions/update-draft-flow-version-action"
import type { FlowVersionResource } from "../schemas/get-flows-schema"
import { ButtonEditorDialog } from "./button-editor-dialog"
import { NodeViewer } from "./nodes/viewer"
import { NodeDetailSheet } from "./nodes/node-detail-sheet"
import { useStepStore } from "./stores/step-store-provider"
import { type FlowNode, NodeType } from "./types"
import { FrameHeader } from "./frame-header"

const nodeTypes = {
  [NodeType.SendMessage]: NodeViewer,
  [NodeType.AddNotes]: NodeViewer,
  [NodeType.Wait]: NodeViewer,
  [NodeType.StartFlow]: NodeViewer,
}

interface ReactFlowFrameProps {
  flowVersion: FlowVersionResource
}

export function ReactFlowFrame({ flowVersion }: ReactFlowFrameProps) {
  const [nodes, _setNodes, onNodesChange] = useNodesState(
    flowVersion.nodes as unknown as FlowNode[],
  )
  const [edges, _setEdges, onEdgesChange] = useEdgesState(
    flowVersion.edges as unknown as Edge[],
  )

  const { openNodeDetailSheet, setOpenNodeDetailSheet } = useStepStore(
    (state) => state,
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

  const handleChanges = useDebouncedCallback((nodes, edges) => {
    savingDraft({ nodes, edges })
  }, 1000)

  useEffect(() => {
    handleChanges(nodes, edges)
  }, [nodes, edges, handleChanges])

  return (
    <>
      <FrameHeader />

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        // // onConnect={onConnect}
        nodeTypes={nodeTypes}
        proOptions={{ hideAttribution: true }}
        onNodeClick={() => {
          // setActiveNode(node)
          setOpenNodeDetailSheet(true)
        }}
        onPaneClick={() => {
          // setActiveNode(null)
          setOpenNodeDetailSheet(false)
        }}
      >
        <MiniMap />
        <Background />
        <Panel position="bottom-center">
          <Controls orientation="horizontal">
            <AddNodeButton />
          </Controls>
        </Panel>
      </ReactFlow>

      <NodeDetailSheet
        open={openNodeDetailSheet}
        onOpenChange={setOpenNodeDetailSheet}
      />

      <ButtonEditorDialog />
    </>
  )
}
