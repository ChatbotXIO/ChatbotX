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
