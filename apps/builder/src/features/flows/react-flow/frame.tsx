"use client"

// import { splitTrafficNodeDefaultValue } from '@/features/flows/react-flow/nodes/split-traffic/schema';
// import SplitTrafficNodeViewer from '@/features/flows/react-flow/nodes/split-traffic/viewer';
import type { findFlow } from "@/features/flows/queries"
import { buttonBlockDefaultValue } from "@/features/flows/react-flow/blocks/button/schema"
import { sendTextBlockDefaultValue } from "@/features/flows/react-flow/blocks/send-text/schema"
import AddNotesNode from "@/features/flows/react-flow/nodes/add-notes/add-notes-node"
import type { AddNotesNodeSchema } from "@/features/flows/react-flow/nodes/add-notes/schema"
import type { SendMessageNodeSchema } from "@/features/flows/react-flow/nodes/send-message/schema"
import SendMessageNodeViewer from "@/features/flows/react-flow/nodes/send-message/viewer"
import { AddBlockButton } from "@/features/flows/react-flow/panels/add-block"
import { NodeDetailSheet } from "@/features/flows/react-flow/panels/node-detail-sheet"
import { PanelAction } from "@/features/flows/react-flow/types"
import { createId } from "@paralleldrive/cuid2"
import { useTranslate } from "@tolgee/react"
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

const nodeTypes = {
  [PanelAction.SendMessage]: SendMessageNodeViewer,
  // [PanelAction.SplitTraffic]: SplitTrafficNodeViewer,
  [PanelAction.AddNotes]: AddNotesNode,
}

const data: SendMessageNodeSchema = {
  id: createId(),
  name: "Send Message",
  messageType: "Whatsapp",
  blocks: [
    sendTextBlockDefaultValue("Ok chưa", [
      buttonBlockDefaultValue("bt1"),
      buttonBlockDefaultValue("bt2"),
    ]),
  ],
}

const defaultNodes: Node[] = [
  {
    id: createId(),
    type: PanelAction.SendMessage,
    position: { x: 200, y: 200 },
    data,
  },
]

interface ReactFlowFrameProps {
  promises: Promise<Awaited<ReturnType<typeof findFlow>>>
  flowVersionId?: string
}

export function ReactFlowFrame({ promises }: ReactFlowFrameProps) {
  const { data: flow } = use(promises)
  const { t } = useTranslate()

  if (!flow) {
    return notFound()
  }

  // if flowVersionId is not specified, use draft version
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
        console.log(222222)
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
    console.log(111111)
    savingDraft({ nodes, edges })
  }, 1000)

  useEffect(() => {
    handleChanges(nodes, edges)
  }, [nodes, edges, handleChanges])

  // const updateTemporaryFlow = useDebouncedCallback(executeDraft, 300)

  const onChooseAction = (name: PanelAction) => {
    let newNode: Node<SendMessageNodeSchema | AddNotesNodeSchema> | undefined
    if (name === PanelAction.SendMessage) {
      let labelVersion = 0
      for (const node of nodes) {
        if (node.type === PanelAction.SendMessage) {
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

      newNode = {
        id: createId(),
        type: PanelAction.SendMessage,
        position: {
          x: 100,
          y: 100,
        },
        data: {
          id: createId(),
          name: `Send Message #${labelVersion + 1}`,
          messageType: "Messenger",
          blocks: [],
        },
      }
    }

    if (name === PanelAction.AddNotes) {
      newNode = {
        id: createId(),
        type: PanelAction.AddNotes,
        position: {
          x: 100,
          y: 100,
        },
        data: {
          id: createId(),
          name: t("flows.addNotes"),
          message: "",
        },
      }
    }

    if (newNode) {
      setNodes((nds) => nds.concat(newNode))
    }
  }

  return (
    <ReactFlowProvider>
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
  )
}
