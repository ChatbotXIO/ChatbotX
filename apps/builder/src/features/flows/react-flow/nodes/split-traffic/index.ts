import {
  nodeTypeSchema,
  splitTrafficNodeDefaultFn,
  splitTrafficNodeSchema,
} from "@chatbotx.io/flow-config"
import { ShuffleIcon } from "lucide-react"
import type { TranslationFn } from "../types"
import { splitTrafficEditorMenus } from "./menu"

const splitTrafficNodeConfig = (t: TranslationFn) => ({
  defaultFn: splitTrafficNodeDefaultFn,
  icon: ShuffleIcon,
  label: t("flows.actions.splitTraffic"),
  menus: splitTrafficEditorMenus,
  type: nodeTypeSchema.enum.splitTraffic,
  validator: splitTrafficNodeSchema,
})

export default splitTrafficNodeConfig
