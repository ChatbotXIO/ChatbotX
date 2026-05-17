import {
  nodeTypeSchema,
  waitNodeDefaultFn,
  waitNodeSchema,
} from "@chatbotx.io/flow-config"
import { ClockIcon } from "lucide-react"
import type { TranslationFn } from "../types"
import { waitMenus } from "./menu"

const waitNodeConfig = (t: TranslationFn) => ({
  defaultFn: waitNodeDefaultFn,
  icon: ClockIcon,
  label: t("actions.wait"),
  menus: waitMenus,
  type: nodeTypeSchema.enum.wait,
  validator: waitNodeSchema,
})

export default waitNodeConfig
