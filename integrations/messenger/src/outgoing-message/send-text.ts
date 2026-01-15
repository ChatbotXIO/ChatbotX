import type { SendTextStepSchema } from "@aha.chat/flow-config"
import type { SendFlowStepProps } from "@aha.chat/sdk"
import type {
  FacebookMessage,
  FacebookMessageAttachment,
  MessengerAuthValue,
} from "../schemas"
import { convertFacebookButtons } from "./send-button"

export function* convertFlowStepText(
  props: SendFlowStepProps<MessengerAuthValue, SendTextStepSchema>,
): Generator<FacebookMessageAttachment | FacebookMessage> {
  const { step } = props
  if (step.buttons.length === 0) {
    yield {
      text: step.message,
    }
  } else {
    const buttons = convertFacebookButtons({
      flowId: props.flowId,
      flowVersionId: props.flowVersionId,
      buttons: step.buttons,
    })

    yield {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: step.message,
          buttons,
        },
      },
    }
  }
}
