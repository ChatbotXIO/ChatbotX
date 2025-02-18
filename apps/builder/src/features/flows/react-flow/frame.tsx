"use client"

import type { findFlow } from "@/features/flows/queries"
import AddNotesNode from "@/features/flows/react-flow/nodes/add-notes/add-notes-node"
import {
  type AddNotesNodeSchema,
  defaultAddNotesNode,
} from "@/features/flows/react-flow/nodes/add-notes/schema"
import {
  type SendMessageNodeSchema,
  defaultSendMessageNode,
} from "@/features/flows/react-flow/nodes/send-message/schema"
import SendMessageNodeViewer from "@/features/flows/react-flow/nodes/send-message/viewer"
import { AddBlockButton } from "@/features/flows/react-flow/panels/add-block"
import { NodeDetailSheet } from "@/features/flows/react-flow/panels/node-detail-sheet"
import {
  Background,
  Controls,
  type Edge,
  MiniMap,
  type Node,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useOptimisticAction } from "next-safe-action/hooks"
import { notFound } from "next/navigation"
import { use, useCallback, useEffect, useState } from "react"
import { useDebouncedCallback } from "use-debounce"
import { updateDraftFlowVersionAction } from "../actions/update-draft-flow-version-action"
import { FrameHeader } from "./frame-header"
import { NodeType } from "./types"

const nodeTypes = {
  [NodeType.SendMessage]: SendMessageNodeViewer,
  [NodeType.AddNotes]: AddNotesNode,
}

interface ReactFlowFrameProps {
  promises: Promise<Awaited<ReturnType<typeof findFlow>>>
  flowVersionId?: string
}

export function ReactFlowFrame({ promises }: ReactFlowFrameProps) {
  const { data: flow } = use(promises)

  if (!flow) {
    return notFound()
  }

  const targetFlowVersion = flow.flowVersions?.find((v) => v.isDraft)
  if (!targetFlowVersion) {
    return notFound()
  }

  const [nodes, setNodes, onNodesChange] = useNodesState(
    targetFlowVersion.nodes as unknown as Node[],
  )
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    targetFlowVersion.edges as unknown as Edge[],
  )

  const [activeNode, setActiveNode] = useState<Node | null>(null)
  const [openNodeDetailSheet, setOpenNodeDetailSheet] = useState<boolean>(false)

  const onConnect = useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    (params: any) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  )

  const { execute: savingDraft } = useOptimisticAction(
    updateDraftFlowVersionAction.bind(null, targetFlowVersion.id),
    {
      currentState: { targetFlowVersion },
      updateFn: (state, updatedData) => {
        return {
          targetFlowVersion: {
            ...state.targetFlowVersion,
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

  // const updateTemporaryFlow = useDebouncedCallback(executeDraft, 300)

  const onChooseAction = (name: NodeType) => {
    let newNode:
      | Node<SendMessageNodeSchema["data"] | AddNotesNodeSchema["data"]>
      | undefined
    if (name === NodeType.SendMessage) {
      let labelVersion = 0
      for (const node of nodes) {
        if (node.type === NodeType.SendMessage) {
          const matched = (node.data.name as string).match(
            /^Send Message #(\d+)$/,
          )
          if (matched) {
            const version = Number.parseInt(matched[1] ?? "0", 10)
            if (version > labelVersion) {
              labelVersion = version
            }
          }
        }
      }

      newNode = defaultSendMessageNode(labelVersion + 1)
    }

    if (name === NodeType.AddNotes) {
      newNode = defaultAddNotesNode()
    }

    if (newNode) {
      setNodes((nds) => nds.concat(newNode))
    }
  }

  return (
    <>
      <ReactFlowProvider>
        <FrameHeader />

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_, node: Node) => {
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
              <AddBlockButton onChooseAction={onChooseAction} />
            </Controls>
          </Panel>
        </ReactFlow>

        <NodeDetailSheet
          open={openNodeDetailSheet}
          onOpenChange={setOpenNodeDetailSheet}
          activeNode={activeNode}
        />
      </ReactFlowProvider>
    </>
  )
}
