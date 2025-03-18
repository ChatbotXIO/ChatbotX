import type { Node } from "@xyflow/react"
import type { IconName } from "lucide-react/dynamic"
import { NodeType } from "../types"
import { addNotesNodeDefaultFn } from "./add-notes/schema"
import { sendMessageNodeDefaultFn } from "./send-message/schema"
import type { NewNodeProps } from "./types"
import { SendMessageNodeEditor } from "./send-message/editor"
import type { JSX } from "react"
import { AddNotesNodeEditor } from "./add-notes/editor"
import type { FlowNode } from "../stores/flow-store"

export interface NodeConfigProps {
  type: NodeType
  icon: IconName
  label: string
  defaultFn: ((config: NewNodeProps) => FlowNode) | undefined
  editor: ({ activeNode }: { activeNode: any }) => JSX.Element
}

export const allNodesConfig: NodeConfigProps[] = [
  {
    type: NodeType.SendMessage,
    icon: "message-circle-more",
    label: "flows.sendMessageBtn",
    defaultFn: sendMessageNodeDefaultFn,
    editor: SendMessageNodeEditor,
  },
  {
    type: NodeType.AddNotes,
    icon: "info",
    label: "flows.addNotesBtn",
    defaultFn: addNotesNodeDefaultFn,
    editor: AddNotesNodeEditor,
  },
  // {
  //   type: NodeType.Wait,
  //   icon: "clock",
  //   label: "flows.waitBtn",
  //   defaultFn: waitNodeDefaultFn,
  //   editor: WaitNodeEditor,
  // },
  // {
  //   type: NodeType.StartFlow,
  //   icon: "external-link",
  //   label: "flows.startFlowBtn",
  //   defaultFn: startFlowNodeDefaultFn,
  // },
  // {
  //   type: NodeType.Actions,
  //   icon: "zap",
  //   label: "flows.actionsBtn",
  //   defaultFn: undefined,
  // },
  // {
  //   type: NodeType.Condition,
  //   icon: "filter",
  //   label: "flows.conditionBtn",
  //   defaultFn: undefined,
  // },
  // {
  //   type: NodeType.SendMail,
  //   icon: "mail",
  //   label: "flows.sendMailBtn",
  //   defaultFn: undefined,
  // },
  // {
  //   type: NodeType.SplitTraffic,
  //   icon: "shuffle",
  //   label: "flows.splitTrafficBtn",
  //   defaultFn: undefined,
  // },
  // {
  //   type: NodeType.LandingPage,
  //   icon: "compass",
  //   label: "flows.landingPageBtn",
  //   defaultFn: undefined,
  // },
]
