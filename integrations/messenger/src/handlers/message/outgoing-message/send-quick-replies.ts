import {
  getCanonicalReplyPayload,
  MESSENGER_NATIVE_QUICK_REPLY,
  type MessageButtonTemplate,
} from "@chatbotx.io/sdk"
import type { FacebookQuickReply } from "../../../schema"

export function convertCanonicalFacebookQuickReplies(
  buttons: MessageButtonTemplate[],
): FacebookQuickReply[] {
  return buttons.map((button): FacebookQuickReply => {
    const payload = getCanonicalReplyPayload(button)
    if (payload === MESSENGER_NATIVE_QUICK_REPLY.USER_EMAIL) {
      return { content_type: "user_email" }
    }
    if (payload === MESSENGER_NATIVE_QUICK_REPLY.USER_PHONE_NUMBER) {
      return { content_type: "user_phone_number" }
    }
    return { content_type: "text", title: button.label, payload }
  })
}
