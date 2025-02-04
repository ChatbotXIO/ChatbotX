"use client"

import { buttonBlockDefaultValue } from "@/features/flows/react-flow/blocks/button/schema"
import { sendTextBlockDefaultValue } from "@/features/flows/react-flow/blocks/send-text/schema"
import AddNotesNode from "@/features/flows/react-flow/nodes/add-notes/add-notes-node"
import type { AddNotesNodeSchema } from "@/features/flows/react-flow/nodes/add-notes/schema"
import type { LandingPageNodeSchema } from "@/features/flows/react-flow/nodes/landing-page/schema"
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
  Panel,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { ActionType } from "@/features/flows/react-flow/action-type"
import { headingBlockDefaultValue } from "@/features/flows/react-flow/blocks/heading/schema"
import type { InputBlockSchema } from "@/features/flows/react-flow/blocks/input/schema"
import type { LineBlockSchema } from "@/features/flows/react-flow/blocks/line/schema"
import type { SelectBlockSchema } from "@/features/flows/react-flow/blocks/select/schema"
import LandingPageNodeViewer from "@/features/flows/react-flow/nodes/landing-page/viewer"
import type { SendMailNodeSchema } from "@/features/flows/react-flow/nodes/send-mail/schema"
import SendMailNodeViewer from "@/features/flows/react-flow/nodes/send-mail/viewer"
import { useCallback, useState } from "react"

const defaultBlockSendMail: Array<
  SelectBlockSchema | InputBlockSchema | LineBlockSchema
> = [
  {
    id: createId(),
    actionType: ActionType.EmailTopic,
    label: "Email Topic",
    selected: "No Topic",
    placeholder: "",
    items: [
      {
        id: createId(),
        name: "No Topic",
        value: "No Topic",
      },
      {
        id: createId(),
        name: "Test",
        value: "Test",
      },
    ],
  },
  {
    id: createId(),
    actionType: ActionType.From,
    input: "namtt@d-soft.com.vn",
    label: "From",
    placeholder: "contact@gmail.com",
  },
  {
    id: createId(),
    actionType: ActionType.To,
    input: "namtt@d-soft.com.vn",
    label: "To",
    placeholder: "email",
  },
  {
    id: createId(),
    actionType: ActionType.Subject,
    input: "",
    label: "Subject",
    placeholder: "Subject",
  },
  {
    id: createId(),
    actionType: ActionType.PreHeader,
    input: "",
    label: "Preheader",
    placeholder: "Preheader",
  },
  {
    id: createId(),
    actionType: ActionType.Line,
  },
]

const nodeTypes = {
  [PanelAction.SendMessage]: SendMessageNodeViewer,
  // [PanelAction.SplitTraffic]: SplitTrafficNodeViewer,
  [PanelAction.AddNotes]: AddNotesNode,
  [PanelAction.LandingPage]: LandingPageNodeViewer,
  [PanelAction.SendMail]: SendMailNodeViewer,
}

const dataSendMessageNode: SendMessageNodeSchema = {
  id: createId(),
  name: "Send Message",
  messageType: "Whatsapp",
  blocks: [
    sendTextBlockDefaultValue("ok chuaw", [
      buttonBlockDefaultValue("bt1"),
      buttonBlockDefaultValue("bt2"),
    ]),
  ],
}

const dataSendMailNode: SendMailNodeSchema = {
  id: createId(),
  blocks: defaultBlockSendMail,
}

const initialNodes: Node[] = [
  {
    id: "1",
    type: PanelAction.SendMail,
    position: { x: 200, y: 200 },
    data: dataSendMailNode,
  },
  // {
  //   id: '2',
  //   type: PanelAction.SplitTraffic,
  //   position: { x: 300, y: 300 },
  //   data: splitTrafficNodeDefaultValue()
  // }
]

const initialEdges: Edge[] = []

export default function FlowPage({ children }: { children: React.ReactNode }) {
  const { t } = useTranslate()

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [activeNode, setActiveNode] = useState<Node | null>(null)
  const [openNodeDetailSheet, setOpenNodeDetailSheet] = useState<boolean>(false)

  const onConnect = useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    (params: any) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  )

  const onChooseAction = (name: PanelAction) => {
    let newNode:
      | Node<
          | SendMessageNodeSchema
          | AddNotesNodeSchema
          | LandingPageNodeSchema
          | SendMailNodeSchema
        >
      | undefined
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

    if (name === PanelAction.LandingPage) {
      newNode = {
        id: createId(),
        type: PanelAction.LandingPage,
        position: {
          x: 100,
          y: 100,
        },
        data: {
          id: createId(),
          blocks: [headingBlockDefaultValue("Header #1")],
        },
      }
    }

    if (name === PanelAction.SendMail) {
      newNode = {
        id: createId(),
        type: PanelAction.SendMail,
        position: {
          x: 100,
          y: 100,
        },
        data: {
          id: createId(),
          blocks: defaultBlockSendMail,
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
