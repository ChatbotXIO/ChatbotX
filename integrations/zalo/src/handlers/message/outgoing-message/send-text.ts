import type { SendTextStepSchema } from "@chatbotx.io/flow-config"
import type { SendFlowStepProps } from "@chatbotx.io/sdk"
import { MAX_BUTTONS } from "../../../constants"
import { logger } from "../../../lib/logger"
import type { ZaloAuthValue } from "../../../schema/definition"
import type { ButtonPayload, MessageTemplate } from "../../../schema/webhook"
import { convertZaloButtons, getCanonicalButtonTemplate } from "./send-button"

export function* convertFlowStepText(
  props: SendFlowStepProps<ZaloAuthValue, SendTextStepSchema>,
): Generator<MessageTemplate> {
  const {
    data: { step },
  } = props
  const quickReplies = props.data.quickReplies ?? []
  const buttonCount = step.buttons.length + quickReplies.length

  if (buttonCount === 0) {
    yield {
      text: step.text,
    }
    return
  }

  const keptButtonCount = Math.min(step.buttons.length, MAX_BUTTONS)
  const keptButtons = step.buttons.slice(0, keptButtonCount)
  const keptQuickReplies = quickReplies.slice(0, MAX_BUTTONS - keptButtonCount)

  if (keptButtonCount + keptQuickReplies.length < buttonCount) {
    logger.warn(
      { total: buttonCount, kept: MAX_BUTTONS },
      `Zalo template buttons support at most ${MAX_BUTTONS}; truncating extra buttons`,
    )
  }

  const rawButtons =
    convertZaloButtons({
      flowId: props.data.flowId,
      flowVersionId: props.data.flowVersionId,
      buttons: keptButtons,
      metadata: props.data.metadata,
      contactInboxId: props.data.contact.id,
    }) ?? []
  const canonicalButtons = keptQuickReplies.map(getCanonicalButtonTemplate)
  const buttonsToSend = [...rawButtons, ...canonicalButtons]
  const buttons: ButtonPayload[] | undefined = buttonsToSend

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
