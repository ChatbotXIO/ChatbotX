import type {
  ButtonStepProps,
  SendQuickReplyStepSchema,
} from "@aha.chat/flow-config"
import type {
  FacebookMessage,
  FacebookMessageAttachment,
  FacebookQuickReply,
} from "../schemas"

export function* convertFlowStepQuickReply(
  flowVersionId: string,
  payload: SendQuickReplyStepSchema,
): Generator<FacebookMessageAttachment | FacebookMessage> {
  if (payload.buttons.length === 0) {
    yield {
      text: payload.message,
    }
  } else {
    const buttons = convertFacebookQuickReplies(flowVersionId, payload.buttons)

    yield {
      text: payload.message,
      quick_replies: buttons,
    }
  }
}

export function convertFacebookQuickReplies(
  flowVersionId: string,
  buttons: ButtonStepProps[],
): FacebookQuickReply[] {
  return buttons.map((button) => ({
    content_type: "text",
    title: button.label,
    payload: `${flowVersionId}_${button.id}`,
  }))
}
