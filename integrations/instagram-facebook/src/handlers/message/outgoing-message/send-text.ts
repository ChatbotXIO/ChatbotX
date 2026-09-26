import type { SendTextStepSchema } from "@chatbotx.io/flow-config"
import type { SendFlowStepProps } from "@chatbotx.io/sdk"
import type {
  InstagramAuthValue,
  InstagramMessageAttachment,
  InstagramSendMessage,
} from "../../../schema"
import { convertButtons } from "./send-button"

export function* convertFlowStepText(
  props: SendFlowStepProps<InstagramAuthValue, SendTextStepSchema>,
): Generator<InstagramMessageAttachment | InstagramSendMessage> {
  const {
    data: { step },
  } = props
  if (step.buttons.length === 0) {
    yield {
      text: step.text,
    }
  } else {
    const buttons = convertButtons({
      flowId: props.data.flowId,
      flowVersionId: props.data.flowVersionId,
      buttons: step.buttons,
      metadata: props.data.metadata,
    })

    yield {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: step.text,
          buttons,
        },
      },
    }
  }
}
