import {
  NodeType,
  sendMailNodeDefaultFn,
  sendMailNodeSchema,
} from "@aha.chat/flow-config"
import { MailIcon } from "lucide-react"
import type { TranslationFn } from "../types"
import { sendMailEditorMenus } from "./menu"

export default function sendMailNodeConfig(t: TranslationFn) {
  return {
    defaultFn: sendMailNodeDefaultFn,
    icon: MailIcon,
    label: t("actions.sendMail"),
    menus: sendMailEditorMenus,
    type: NodeType.sendMail,
    validator: sendMailNodeSchema,
  }
}
