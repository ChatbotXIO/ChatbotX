import { MessageCircleMoreIcon } from "lucide-react"
import { NodeType } from "../../types"
import type { NodeConfigProps } from "../node-config"
import { sendMessageEditorMenus } from "./menu"
import { sendMessageNodeDefaultFn, sendMessageNodeSchema } from "./schema"

const sendMessageNodeConfig: NodeConfigProps = {
  defaultFn: sendMessageNodeDefaultFn,
  icon: MessageCircleMoreIcon,
  label: "flows.sendMessageBtn",
  menus: sendMessageEditorMenus,
  type: NodeType.SendMessage,
  validator: sendMessageNodeSchema,
}

export default sendMessageNodeConfig
