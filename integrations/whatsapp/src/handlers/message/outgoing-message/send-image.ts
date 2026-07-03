import type { SendImageStepSchema } from "@chatbotx.io/flow-config"
import type { MessageHandlers } from "@chatbotx.io/sdk"
import { Header, Image } from "whatsapp-api-js/messages"
import { logger } from "../../../lib/logger"
import type { WhatsappAuthValue } from "../../../schema"
import { buildWhatsappButtonMessages, MAX_BUTTONS } from "./shared"

export function* convertFlowStepImage(
  props: Parameters<
    MessageHandlers<WhatsappAuthValue, SendImageStepSchema>["sendFlowStep"]
  >[0],
) {
  const {
    data: { step },
  } = props
  const quickReplies = props.data.quickReplies ?? []
  const buttonCount = step.buttons.length + quickReplies.length
  if (buttonCount === 0) {
    yield new Image(step.url)
    return
  }

  // An image header can only be combined with the 3-button "reply buttons"
  // layout, not the list layout — so buttons must fit within MAX_BUTTONS to
  // keep the image attached to the message.
  const keptButtonCount = Math.min(step.buttons.length, MAX_BUTTONS)
  const buttons = step.buttons.slice(0, keptButtonCount)
  const keptQuickReplies = quickReplies.slice(0, MAX_BUTTONS - keptButtonCount)

  if (keptButtonCount + keptQuickReplies.length < buttonCount) {
    logger.warn(
      { total: buttonCount, kept: MAX_BUTTONS },
      "WhatsApp only supports an image header alongside up to 3 buttons; truncating extra buttons to keep the image",
    )
  }

  for (const message of buildWhatsappButtonMessages({
    flowId: props.data.flowId,
    flowVersionId: props.data.flowVersionId,
    buttons,
    quickReplies: keptQuickReplies,
    metadata: props.data.metadata,
    bodyText: "",
    header: new Header(new Image(step.url)),
  })) {
    yield message
  }
}
