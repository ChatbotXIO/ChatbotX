import {
  landingPageNodeDefaultFn,
  landingPageNodeSchema,
  NodeType,
} from "@aha.chat/flow-config"
import { AppWindowIcon } from "lucide-react"
import type { TranslationFn } from "../types"
import { landingPageEditorMenus } from "./menu"

export default function landingPageNodeConfig(t: TranslationFn) {
  return {
    defaultFn: landingPageNodeDefaultFn,
    icon: AppWindowIcon,
    label: t("actions.landingPage"),
    menus: landingPageEditorMenus,
    type: NodeType.landingPage,
    validator: landingPageNodeSchema,
  }
}
