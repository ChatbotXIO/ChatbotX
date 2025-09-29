import type { SendTextStepSchema } from "@aha.chat/flow-config"
import {
  type FacebookMessage,
  type FacebookMessageAttachment,
  MESSENGER_MESSAGE_METADATA,
} from "../schemas"
import { convertFacebookButtons } from "./send-button"

export function* convertFlowStepText(
  flowVersionId: string,
  payload: SendTextStepSchema,
): Generator<FacebookMessageAttachment | FacebookMessage> {
  if (payload.buttons.length === 0) {
    yield {
      text: payload.message,
      metadata: MESSENGER_MESSAGE_METADATA,
    }
  } else {
    const buttons = convertFacebookButtons(flowVersionId, payload.buttons)

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
