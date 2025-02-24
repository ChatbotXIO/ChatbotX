"use client"

import AddNotesNode from "@/features/flows/react-flow/nodes/add-notes/add-notes-node"
import { defaultAddNotesNode } from "@/features/flows/react-flow/nodes/add-notes/schema"
import { defaultSendMessageNode } from "@/features/flows/react-flow/nodes/send-message/schema"
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
import type { findFlow } from "@/features/flows/queries"
import { startFlowNodeDefaultValue } from "@/features/flows/react-flow/nodes/start-flow/schema"
import StartFlowNodeViewer from "@/features/flows/react-flow/nodes/start-flow/viewer"
import { waitNodeDefaultValue } from "@/features/flows/react-flow/nodes/wait/schema"
import WaitNodeViewer from "@/features/flows/react-flow/nodes/wait/viewer"
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
  [NodeType.Wait]: WaitNodeViewer,
  [NodeType.StartFlow]: StartFlowNodeViewer,
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
    (params: any) =>
      setEdges((eds) => {
        return addEdge(
          params,
          eds.filter((obj) => obj.sourceHandle !== params.sourceHandle),
        )
      }),
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

  // const { getViewport } = useReactFlow()
  const getCenterViewport = () => {
    // Get the current viewport
    // const { x, y, zoom } = getViewport()

    // // Calculate the center of the viewport
    // const centerX = -x + window.innerWidth / 2 / zoom
    // const centerY = -y + window.innerHeight / 2 / zoom

    return { x: 100, y: 200 }
  }

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  const mappingNodeAttributes: Record<NodeType, { defaultFn: any }> = {
    [NodeType.SendMessage]: {
      defaultFn: defaultSendMessageNode,
    },
    [NodeType.AddNotes]: {
      defaultFn: defaultAddNotesNode,
    },
    [NodeType.Wait]: {
      defaultFn: waitNodeDefaultValue,
    },
    [NodeType.StartFlow]: {
      defaultFn: startFlowNodeDefaultValue,
    },
    [NodeType.Actions]: {
      defaultFn: undefined,
    },
    [NodeType.Condition]: {
      defaultFn: undefined,
    },
    [NodeType.SendMail]: {
      defaultFn: undefined,
    },
    [NodeType.SplitTraffic]: {
      defaultFn: undefined,
    },
    [NodeType.LandingPage]: {
      defaultFn: undefined,
    },
  }

  mappingNodeAttributes[NodeType.SendMessage]

  const onChooseAction = (name: NodeType) => {
    // calc version
    let labelVersion = 1
    for (const node of nodes) {
      if (node.type === name) {
        labelVersion++
      }
    }

    const newNode = mappingNodeAttributes[name].defaultFn({
      labelVersion,
      position: getCenterViewport(),
    })
    setNodes((nds) => nds.concat(newNode))
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
