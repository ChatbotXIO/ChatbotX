import {
  NodeType,
  startFlowNodeDefaultFn,
  startFlowNodeSchema,
} from "@aha.chat/flow-config"
import { ExternalLinkIcon } from "lucide-react"
import type { TranslationFn } from "../types"

const startFlowNodeConfig = (t: TranslationFn) => ({
  defaultFn: startFlowNodeDefaultFn,
  icon: ExternalLinkIcon,
  label: t("flows.actions.startFlow"),
  menus: () => [],
  type: NodeType.startFlow,
  validator: startFlowNodeSchema,
})

export default startFlowNodeConfig
