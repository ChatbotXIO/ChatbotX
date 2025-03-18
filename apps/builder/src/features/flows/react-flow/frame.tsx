"use client"

import { AddNotesNodeViewer } from "@/features/flows/react-flow/nodes/add-notes/add-notes-node"
import SendMessageNodeViewer from "@/features/flows/react-flow/nodes/send-message/viewer"
import StartFlowNodeViewer from "@/features/flows/react-flow/nodes/start-flow/viewer"
import WaitNodeViewer from "@/features/flows/react-flow/nodes/wait/viewer"
import { AddBlockButton } from "@/features/flows/react-flow/panels/add-block"
import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useOptimisticAction } from "next-safe-action/hooks"
import { useEffect, useState } from "react"
import { useDebouncedCallback } from "use-debounce"
import { updateDraftFlowVersionAction } from "../actions/update-draft-flow-version-action"
import type { FlowVersionResource } from "../schemas/get-flows-schema"
import { NodeDetailSheet } from "./panels/node-detail-sheet"
import type { FlowNode } from "./stores/flow-store"
import { useFlowStore } from "./stores/flow-store-provider"
import { NodeType } from "./types"

const nodeTypes = {
  [NodeType.SendMessage]: SendMessageNodeViewer,
  [NodeType.AddNotes]: AddNotesNodeViewer,
  [NodeType.Wait]: WaitNodeViewer,
  [NodeType.StartFlow]: StartFlowNodeViewer,
}

interface ReactFlowFrameProps {
  flowVersion: FlowVersionResource
}

export function ReactFlowFrame({ flowVersion }: ReactFlowFrameProps) {
  const {
    nodes,
    onNodesChange,
    setActiveNode,
    edges,
    onEdgesChange,
    onConnect,
  } = useFlowStore((state) => state)

  // const [activeNode, setActiveNode] = useState<Node | null>(null)
  const [openNodeDetailSheet, setOpenNodeDetailSheet] = useState<boolean>(false)

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
      <ReactFlowProvider>
        {/* <FrameHeader /> */}

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_, node: FlowNode) => {
            setActiveNode(node)
            setOpenNodeDetailSheet(true)
          }}
          onPaneClick={() => {
            setActiveNode(null)
            setOpenNodeDetailSheet(false)
          }}
        >
          <MiniMap />
          <Background />
          <Panel position="bottom-center">
            <Controls orientation="horizontal">
              <AddBlockButton />
            </Controls>
          </Panel>
        </ReactFlow>

        <NodeDetailSheet
          open={openNodeDetailSheet}
          onOpenChange={setOpenNodeDetailSheet}
        />
      </ReactFlowProvider>
    </>
  )
}
