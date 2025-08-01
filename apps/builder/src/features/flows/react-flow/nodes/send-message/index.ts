import { MessageCircleMoreIcon } from "lucide-react"
import type { NodeConfigProps } from "../node-config"
import { sendMessageEditorMenus } from "./menu"
import {
  NodeType,
  sendMessageNodeDefaultFn,
  sendMessageNodeSchema,
} from "@aha.chat/flow-config"

const sendMessageNodeConfig: NodeConfigProps = {
  defaultFn: sendMessageNodeDefaultFn,
  icon: MessageCircleMoreIcon,
  label: "flows.sendMessageBtn",
  menus: sendMessageEditorMenus,
  type: NodeType.SendMessage,
  validator: sendMessageNodeSchema,
}

export default sendMessageNodeConfig
