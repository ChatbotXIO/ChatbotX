import {
  nodeTypeSchema,
  startFlowNodeDefaultFn,
  startFlowNodeSchema,
} from "@chatbotx.io/flow-config"
import { ExternalLinkIcon } from "lucide-react"
import type { TranslationFn } from "../types"

const startFlowNodeConfig = (t: TranslationFn) => ({
  defaultFn: startFlowNodeDefaultFn,
  icon: ExternalLinkIcon,
  label: t("flows.actions.startFlow"),
  menus: () => [],
  type: nodeTypeSchema.enum.startFlow,
  validator: startFlowNodeSchema,
})

export default startFlowNodeConfig
