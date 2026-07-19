import {
  conditionNodeDefaultFn,
  nodeTypeSchema,
} from "@chatbotx.io/flow-config"
import { FilterIcon } from "lucide-react"
import type { TranslationFn } from "../types"
import { conditionMenus } from "./menu"
import { conditionNodeEditorSchema } from "./validator"

const conditionNodeConfig = (t: TranslationFn) => ({
  defaultFn: conditionNodeDefaultFn,
  icon: FilterIcon,
  label: t("flows.actions.condition"),
  menus: conditionMenus,
  type: nodeTypeSchema.enum.condition,
  validator: conditionNodeEditorSchema,
})

export default conditionNodeConfig
