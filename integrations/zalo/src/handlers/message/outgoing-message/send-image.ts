import {
  type SendGifStepSchema,
  type SendImageStepSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import type { SendFlowStepProps } from "@chatbotx.io/sdk"
import { uploadAttachment } from "../../../api/message"
import { MAX_BUTTONS } from "../../../constants"
import { logger } from "../../../lib/logger"
import type { ZaloAuthValue } from "../../../schema/definition"
import type { ButtonPayload, MessageTemplate } from "../../../schema/webhook"
import { convertZaloButtons, getCanonicalButtonTemplate } from "./send-button"

export async function* convertFlowStepImage(
  props: SendFlowStepProps<
    ZaloAuthValue,
    SendImageStepSchema | SendGifStepSchema
  >,
): AsyncGenerator<MessageTemplate> {
  const {
    data: { step },
  } = props
  try {
    if (!step.url?.trim()) {
      throw new Error("Image URL is required")
    }

    const mediaType = step.stepType === stepTypes.enum.sendGif ? "gif" : "image"
    const {
      data: { attachment_id, width, height },
    } = await uploadAttachment(props.ctx.auth, mediaType, step.url)

    if (!attachment_id) {
      throw new Error("Failed to upload image: No attachment ID received")
    }

    const canonicalButtons = (props.data.quickReplies ?? []).map(
      getCanonicalButtonTemplate,
    )
    let rawButtons: ButtonPayload[] = []

    if (step.stepType === stepTypes.enum.sendImage) {
      rawButtons =
        convertZaloButtons({
          flowId: props.data.flowId,
          flowVersionId: props.data.flowVersionId,
          buttons: step.buttons,
          metadata: props.data.metadata,
          contactInboxId: props.data.contact.id,
        }) ?? []
    }

    const combinedButtons = [...rawButtons, ...canonicalButtons]
    const buttonsToSend = combinedButtons.slice(0, MAX_BUTTONS)
    if (buttonsToSend.length < combinedButtons.length) {
      logger.warn(
        { total: combinedButtons.length, kept: MAX_BUTTONS },
        `Zalo template buttons support at most ${MAX_BUTTONS}; truncating extra buttons`,
      )
    }

    const buttons = buttonsToSend.length > 0 ? buttonsToSend : undefined
    yield {
      attachment: {
        type: "template",
        payload: {
          template_type: "media",
          elements: [
            {
              media_type: mediaType,
              attachment_id,
              width,
              height,
            },
          ],
          buttons,
        },
      },
    }
  } catch (error) {
    logger.error(error, "Error uploading media")
    throw error
  }
}
