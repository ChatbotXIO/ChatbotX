import type { SendTextStepSchema } from "@chatbotx.io/flow-config"
import type { MessageHandlers } from "@chatbotx.io/sdk"
import { Text } from "whatsapp-api-js/messages"
import type { WhatsappAuthValue } from "../../../schema"
import { buildWhatsappButtonMessages } from "./shared"

export function* convertFlowStepText(
  props: Parameters<
    MessageHandlers<WhatsappAuthValue, SendTextStepSchema>["sendFlowStep"]
  >[0],
) {
  const {
    data: { step },
  } = props
  const buttonCount =
    step.buttons.length + (props.data.quickReplies?.length ?? 0)
  if (buttonCount === 0) {
    yield new Text(step.text)
    return
  }

  for (const message of buildWhatsappButtonMessages({
    flowId: props.data.flowId,
    flowVersionId: props.data.flowVersionId,
    buttons: step.buttons,
    quickReplies: props.data.quickReplies,
    metadata: props.data.metadata,
    bodyText: step.text,
  })) {
    yield message
  }
}
