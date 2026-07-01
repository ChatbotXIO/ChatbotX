import type { SendTextStepSchema } from "@chatbotx.io/flow-config"
import type { SendFlowStepProps } from "@chatbotx.io/sdk"
import { MAX_BUTTONS } from "../../../constants"
import type { ZaloAuthValue } from "../../../schema/definition"
import type { ButtonPayload, MessageTemplate } from "../../../schema/webhook"
import { convertZaloButtons } from "./send-button"

export function* convertFlowStepText(
  props: SendFlowStepProps<ZaloAuthValue, SendTextStepSchema>,
): Generator<MessageTemplate> {
  const {
    data: { step },
  } = props
  const buttonsToSend = [...step.buttons, ...(props.data.quickReplies ?? [])]
  if (buttonsToSend.length === 0) {
    yield {
      text: step.text,
    }
  } else {
    if (buttonsToSend.length > MAX_BUTTONS) {
      throw new Error(`Zalo template buttons support at most ${MAX_BUTTONS}`)
    }
    const buttons: ButtonPayload[] | undefined = convertZaloButtons({
      flowId: props.data.flowId,
      flowVersionId: props.data.flowVersionId,
      buttons: buttonsToSend,
      metadata: props.data.metadata,
      contactInboxId: props.data.contact.id,
    })

    yield {
      text: step.text,
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
