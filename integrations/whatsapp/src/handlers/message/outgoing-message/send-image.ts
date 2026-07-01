import type { SendImageStepSchema } from "@chatbotx.io/flow-config"
import type { MessageHandlers } from "@chatbotx.io/sdk"
import { Header, Image } from "whatsapp-api-js/messages"
import type { WhatsappAuthValue } from "../../../schema"
import { buildWhatsappButtonMessages } from "./shared"

export function* convertFlowStepImage(
  props: Parameters<
    MessageHandlers<WhatsappAuthValue, SendImageStepSchema>["sendFlowStep"]
  >[0],
) {
  const {
    data: { step },
  } = props
  const buttons = [...step.buttons, ...(props.data.quickReplies ?? [])]
  if (buttons.length === 0) {
    yield new Image(step.url)
    return
  }

  for (const message of buildWhatsappButtonMessages({
    flowId: props.data.flowId,
    flowVersionId: props.data.flowVersionId,
    buttons,
    metadata: props.data.metadata,
    bodyText: "",
    header: buttons.length <= 3 ? new Header(new Image(step.url)) : undefined,
  })) {
    yield message
  }
}
