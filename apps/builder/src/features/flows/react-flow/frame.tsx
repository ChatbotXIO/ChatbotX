"use client"

import { buttonBlockDefaultValue } from "@/features/flows/react-flow/blocks/button/schema"
import { sendTextBlockDefaultValue } from "@/features/flows/react-flow/blocks/send-text/schema"
import AddNotesNode from "@/features/flows/react-flow/nodes/add-notes/add-notes-node"
import type { AddNotesNodeSchema } from "@/features/flows/react-flow/nodes/add-notes/schema"
import type { SendMessageNodeSchema } from "@/features/flows/react-flow/nodes/send-message/schema"
import SendMessageNodeViewer from "@/features/flows/react-flow/nodes/send-message/viewer"
// import { splitTrafficNodeDefaultValue } from '@/features/flows/react-flow/nodes/split-traffic/schema';
// import SplitTrafficNodeViewer from '@/features/flows/react-flow/nodes/split-traffic/viewer';
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
  type NodeProps,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import type { getFields } from "@/features/fields/queries"
import { draftFlowAction } from "@/features/flows/actions/draft-flow-action"
import type { getCurrentFlow, getFlows } from "@/features/flows/queries"
import { nodeDefaultValue } from "@/features/flows/react-flow/nodes/schema"
import { startFlowNodeDefaultValue } from "@/features/flows/react-flow/nodes/start-flow/schema"
import StartFlowNodeViewer from "@/features/flows/react-flow/nodes/start-flow/viewer"
import { waitNodeDefaultValue } from "@/features/flows/react-flow/nodes/wait/schema"
import WaitNodeViewer from "@/features/flows/react-flow/nodes/wait/viewer"
import { useAction } from "next-safe-action/hooks"
import { useRouter } from "next/navigation"
import { use, useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { useDebouncedCallback } from "use-debounce"

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
  promises: Promise<
    [
      Awaited<ReturnType<typeof getCurrentFlow>>,
      Awaited<ReturnType<typeof getFields>>,
      Awaited<ReturnType<typeof getFlows>>,
    ]
  >
}

export function ReactFlowFrame({ promises }: ReactFlowFrameProps) {
  const [{ flow }, { data: customFields }, { data: flows }] = use(promises)
  const { t } = useTranslate()
  const router = useRouter()

  const nodeTypes = useMemo(
    () => ({
      [PanelAction.SendMessage]: SendMessageNodeViewer,
      // [PanelAction.SplitTraffic]: SplitTrafficNodeViewer,
      [PanelAction.AddNotes]: AddNotesNode,
      [PanelAction.Wait]: (props: NodeProps<Node>) => (
        <WaitNodeViewer customFields={customFields} {...props} />
      ),
      [PanelAction.StartFlow]: (props: NodeProps<Node>) => (
        <StartFlowNodeViewer flows={flows} {...props} />
      ),
    }),
    [customFields, flows],
  )

  useEffect(() => {
    if (flow.folder?.isTrash) {
      toast.error("Resource was deleted")
      router.push(`/chatbots/${flow.chatbotId}/flows`)
    }
  }, [flow, router])

  const initialNodes = (): Node[] => {
    let nodes = flow.currentVersion?.nodes ?? flow.flowVersions?.[0]?.nodes
    if (!nodes || (Array.isArray(nodes) && !nodes.length)) {
      nodes = JSON.parse(JSON.stringify(defaultNodes))
    }
    return JSON.parse(JSON.stringify(nodes)) as unknown as Node[]
  }
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes())

  const initialEdges = (): Edge[] => {
    const edges = flow.currentVersion?.edges ?? flow.flowVersions?.[0]?.edges
    if (Array.isArray(edges)) {
      return edges as unknown as Edge[]
    }

    return []
  }
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges())

  useEffect(() => {
    updateTemporaryFlow({ nodes, edges })
  }, [nodes, edges])

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

  const { execute: executeDraft } = useAction(
    draftFlowAction.bind(null, flow.chatbotId, flow.id),
    {
      onError: ({ error }) => {
        console.log("error", error)
        if (error.serverError) {
          toast.error(error.serverError.message ?? error.serverError)
        }
      },
    },
  )

  const updateTemporaryFlow = useDebouncedCallback(executeDraft, 300)

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

    if (name === PanelAction.Wait) {
      newNode = nodeDefaultValue(PanelAction.Wait, waitNodeDefaultValue())
    }

    if (name === PanelAction.StartFlow) {
      newNode = nodeDefaultValue(
        PanelAction.StartFlow,
        startFlowNodeDefaultValue(),
      )
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
        flow={flow}
      />
    </ReactFlowProvider>
  )
}
