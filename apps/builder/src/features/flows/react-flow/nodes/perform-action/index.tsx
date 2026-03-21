import {
  NodeType,
  performActionNodeDefaultFn,
  performActionNodeSchema,
} from "@chatbotx.io/flow-config"
import { ZapIcon } from "lucide-react"
import type { TranslationFn } from "../types"
import { performActionMenus } from "./menu"

const performActionNodeConfig = (t: TranslationFn) => ({
  defaultFn: performActionNodeDefaultFn,
  icon: ZapIcon,
  label: t("flows.actions.performAction"),
  menus: performActionMenus,
  type: NodeType.performAction,
  validator: performActionNodeSchema,
})

export default performActionNodeConfig
