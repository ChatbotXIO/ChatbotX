import {
  NodeType,
  sendMessageNodeDefaultFn,
  sendMessageNodeSchema,
} from "@chatbotx.io/flow-config"
import { MessageCircleMoreIcon } from "lucide-react"
import type { TranslationFn } from "../types"
import { sendMessageEditorMenus } from "./menu"

const sendMessageNodeConfig = (t: TranslationFn) => ({
  defaultFn: sendMessageNodeDefaultFn,
  icon: MessageCircleMoreIcon,
  label: t("actions.sendMessage"),
  menus: sendMessageEditorMenus,
  type: NodeType.sendMessage,
  validator: sendMessageNodeSchema,
})

export default sendMessageNodeConfig
