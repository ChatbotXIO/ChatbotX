import type { ZodSchema } from "zod"
import { type FlowNode, NodeType } from "../types"
import sendMessageNodeConfig from "./send-message"
import type { MenuItem, NewNodeProps } from "./types"
import type { LucideIcon } from "lucide-react"

export interface NodeConfigProps {
  type: NodeType
  icon: LucideIcon
  label: string
  defaultFn: ((config: NewNodeProps) => FlowNode) | undefined
  validator: ZodSchema
  menus: MenuItem[]
}

export const allNodesConfig: Record<NodeType, NodeConfigProps> = {
  [NodeType.SendMessage]: sendMessageNodeConfig,
  // {
  //   type: NodeType.AddNotes,
  //   icon: "info",
  //   label: "flows.addNotesBtn",
  //   defaultFn: addNotesNodeDefaultFn,
  //   editor: AddNotesNodeEditor,
  // },
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
}
