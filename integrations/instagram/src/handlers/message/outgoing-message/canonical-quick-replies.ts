import {
  getCanonicalReplyPayload,
  type MessageButtonTemplate,
  type SendFlowStepProps,
} from "@chatbotx.io/sdk"
import type {
  InstagramAuthValue,
  InstagramQuickReply,
  InstagramSendMessage,
} from "../../../schema"

export function convertCanonicalQuickReplies(
  buttons: MessageButtonTemplate[],
): InstagramQuickReply[] {
  return buttons.map((button) => ({
    content_type: "text",
    title: button.label,
    payload: getCanonicalReplyPayload(button),
  }))
}

/** Attaches the step's quick replies to a message, when it has any. */
export const withQuickReplies =
  (
    quickReplies: SendFlowStepProps<InstagramAuthValue>["data"]["quickReplies"],
  ) =>
  (message: InstagramSendMessage): InstagramSendMessage =>
    quickReplies && quickReplies.length > 0
      ? {
          ...message,
          quick_replies: convertCanonicalQuickReplies(quickReplies),
        }
      : message
