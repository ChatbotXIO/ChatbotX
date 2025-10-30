import {
  NodeType,
  waitNodeDefaultFn,
  waitNodeSchema,
} from "@aha.chat/flow-config"
import { ClockIcon } from "lucide-react"
import type { TranslationFn } from "../types"

const waitNodeConfig = (t: TranslationFn) => ({
  defaultFn: waitNodeDefaultFn,
  icon: ClockIcon,
  label: t("actions.wait"),
  menus: () => [],
  type: NodeType.wait,
  validator: waitNodeSchema,
})

export default waitNodeConfig
