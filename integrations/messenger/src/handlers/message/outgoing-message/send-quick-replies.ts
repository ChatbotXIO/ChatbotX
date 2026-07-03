import {
  getCanonicalReplyPayload,
  type MessageButtonTemplate,
} from "@chatbotx.io/sdk"
import type { FacebookQuickReply } from "../../../schema"

export function convertCanonicalFacebookQuickReplies(
  buttons: MessageButtonTemplate[],
): FacebookQuickReply[] {
  return buttons.map((button) => ({
    content_type: "text",
    title: button.label,
    payload: getCanonicalReplyPayload(button),
  }))
}
