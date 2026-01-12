import type { SendTextStepSchema } from "@aha.chat/flow-config"
import type { FacebookMessage, FacebookMessageAttachment } from "../schemas"
import { convertFacebookButtons } from "./send-button"

export function* convertFlowStepText(
  flowId: string,
  flowVersionId: string,
  payload: SendTextStepSchema,
): Generator<FacebookMessageAttachment | FacebookMessage> {
  if (payload.buttons.length === 0) {
    yield {
      text: payload.message,
    }
  } else {
    const buttons = convertFacebookButtons(
      flowId,
      flowVersionId,
      payload.buttons,
    )

    yield {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: payload.message,
          buttons,
        },
      },
    }
  }
}
