import type { SendTextStepSchema } from "@aha.chat/flow-config"
import type { SendFlowStepProps } from "@aha.chat/sdk"
import type { ZaloAuthValue } from "../schemas/definition"
import type { ButtonPayload, MessageTemplate } from "../schemas/webhook"
import { convertZaloButtons } from "./send-button"

export function* convertFlowStepText(
  props: SendFlowStepProps<ZaloAuthValue, SendTextStepSchema>,
): Generator<MessageTemplate> {
  const { step } = props
  if (step.buttons.length === 0) {
    yield {
      text: step.message,
    }
  } else {
    const buttons: ButtonPayload[] | undefined = convertZaloButtons({
      flowId: props.flowId,
      flowVersionId: props.flowVersionId,
      buttons: step.buttons,
    })

    yield {
      text: step.message,
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
