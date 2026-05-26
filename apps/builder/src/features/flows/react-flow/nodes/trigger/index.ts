import {
  nodeTypeSchema,
  triggerNodeDefaultFn,
  triggerNodeSchema,
} from "@chatbotx.io/flow-config"
import { ZapIcon } from "lucide-react"
import type { TranslationFn } from "../types"
import { triggerMenus } from "./menu"

const triggerNodeConfig = (t: TranslationFn) => ({
  defaultFn: triggerNodeDefaultFn,
  icon: ZapIcon,
  label: t("actions.trigger"),
  menus: triggerMenus,
  type: nodeTypeSchema.enum.trigger,
  validator: triggerNodeSchema,
})

export default triggerNodeConfig
