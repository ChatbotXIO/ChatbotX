import {
  type FlowNode,
  type NewNodeProps,
  NodeType,
} from "@aha.chat/flow-config"
import type { LucideIcon } from "lucide-react"
import sendMessageNodeConfig from "./send-message"
import type { MenuItem } from "./types"

export type NodeConfigProps = {
  type: NodeType
  icon: LucideIcon
  label: string
  defaultFn: ((config: NewNodeProps) => FlowNode) | undefined
  // biome-ignore lint/suspicious/noExplicitAny: wip
  validator: any
  menus: MenuItem[]
}

export const allNodesConfig: Record<NodeType, NodeConfigProps | undefined> = {
  [NodeType.SendMessage]: sendMessageNodeConfig,
  [NodeType.StartFlow]: undefined,
  [NodeType.Actions]: undefined,
  [NodeType.Condition]: undefined,
  [NodeType.SendMail]: undefined,
  [NodeType.SplitTraffic]: undefined,
  [NodeType.Wait]: undefined,
  [NodeType.LandingPage]: undefined,
  [NodeType.AddNotes]: undefined,
}
