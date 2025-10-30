import {
  type BaseNodeProps,
  type BaseNodeSchema,
  type FlowNode,
  type NodeFnProps,
  NodeType,
} from "@aha.chat/flow-config"
import type { LucideIcon } from "lucide-react"
import performActionNodeConfig from "./perform-action"
import sendMessageNodeConfig from "./send-message"
import startFlowNodeConfig from "./start-flow"
import type { MenuItem, TranslationFn } from "./types"

export type NodeConfigProps<
  I extends BaseNodeSchema,
  J extends BaseNodeProps,
> = {
  type: NodeType
  icon: LucideIcon
  label: string
  defaultFn: ((config: NodeFnProps<J>) => FlowNode) | undefined
  validator: I
  menus: (t: TranslationFn) => MenuItem[]
}

export const allNodesConfig = {
  [NodeType.sendMessage]: sendMessageNodeConfig,
  [NodeType.startFlow]: startFlowNodeConfig,
  [NodeType.performAction]: performActionNodeConfig,
  [NodeType.condition]: undefined,
  [NodeType.sendMail]: undefined,
  [NodeType.splitTraffic]: undefined,
  [NodeType.wait]: undefined,
  [NodeType.landingPage]: undefined,
  [NodeType.addNotes]: undefined,
}
