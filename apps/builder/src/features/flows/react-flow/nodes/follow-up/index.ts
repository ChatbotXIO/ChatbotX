import {
  followUpNodeDefaultFn,
  followUpNodeSchema,
  nodeTypeSchema,
} from "@chatbotx.io/flow-config"
import { AlarmClockCheckIcon } from "lucide-react"
import type { TranslationFn } from "../types"
import { followUpMenus } from "./menu"

const followUpNodeConfig = (t: TranslationFn) => ({
  defaultFn: followUpNodeDefaultFn,
  icon: AlarmClockCheckIcon,
  label: t("actions.followUp"),
  menus: followUpMenus,
  type: nodeTypeSchema.enum.followUp,
  validator: followUpNodeSchema,
})

export default followUpNodeConfig
