import sendMessageNodeConfig from "./send-message"
import type { MenuItem } from "./types"
import type { LucideIcon } from "lucide-react"
import {
  NodeType,
  type NewNodeProps,
  type FlowNode,
} from "@ahachat.ai/flow-config"

export interface NodeConfigProps {
  type: NodeType
  icon: LucideIcon
  label: string
  defaultFn: ((config: NewNodeProps) => FlowNode) | undefined
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
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
