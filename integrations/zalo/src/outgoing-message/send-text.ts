import type { SendTextStepSchema } from "@aha.chat/flow-config"
import type { ButtonPayload, MessageTemplate } from "../schemas/webhook"
import { convertZaloButtons } from "./send-button"

export function* convertFlowStepText(
  flowVersionId: string,
  payload: SendTextStepSchema,
): Generator<MessageTemplate> {
  if (payload.buttons.length === 0) {
    yield {
      text: payload.message,
    }
  } else {
    const buttons: ButtonPayload[] | undefined = convertZaloButtons(
      flowVersionId,
      payload.buttons,
    )

    yield {
      text: payload.message,
      attachment: buttons
        ? {
            type: "template",
            payload: {
              buttons,
            },
          }
        : undefined,
    }
  }
}
