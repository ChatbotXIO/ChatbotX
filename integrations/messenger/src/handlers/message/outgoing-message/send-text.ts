import type { SendTextStepSchema } from "@chatbotx.io/flow-config"
import type { SendFlowStepProps } from "@chatbotx.io/sdk"
import type {
  FacebookMessage,
  FacebookMessageAttachment,
  MessengerAuthValue,
} from "../../../schema"
import { convertFacebookButtons } from "./send-button"

export function* convertFlowStepText(
  props: SendFlowStepProps<MessengerAuthValue, SendTextStepSchema>,
): Generator<FacebookMessageAttachment | FacebookMessage> {
  const {
    data: { step },
  } = props
  if (step.buttons.length === 0) {
    yield {
      text: step.text,
    }
  } else {
    const buttons = convertFacebookButtons({
      flowId: props.data.flowId,
      flowVersionId: props.data.flowVersionId,
      buttons: step.buttons,
      metadata: props.data.metadata,
      contactInboxId: props.data.contact.id,
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
