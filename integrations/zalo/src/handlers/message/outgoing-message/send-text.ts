import type { SendTextStepSchema } from "@chatbotx.io/flow-config"
import type { SendFlowStepProps } from "@chatbotx.io/sdk"
import type { ZaloAuthValue } from "../../../schema/definition"
import type { ButtonPayload, MessageTemplate } from "../../../schema/webhook"
import { convertZaloButtons } from "./send-button"

export function* convertFlowStepText(
  props: SendFlowStepProps<ZaloAuthValue, SendTextStepSchema>,
): Generator<MessageTemplate> {
  const {
    data: { step },
  } = props
  if (step.buttons.length === 0) {
    yield {
      text: step.text,
    }
  } else {
    const buttons: ButtonPayload[] | undefined = convertZaloButtons({
      flowId: props.data.flowId,
      flowVersionId: props.data.flowVersionId,
      buttons: step.buttons,
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
