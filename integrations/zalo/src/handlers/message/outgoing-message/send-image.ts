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
import type { MessageTemplate } from "../../../schema/webhook"
import { convertZaloButtons } from "./send-button"

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

    const buttonsToSend =
      step.stepType === stepTypes.enum.sendImage
        ? [...step.buttons, ...(props.data.quickReplies ?? [])]
        : []
    if (buttonsToSend.length > MAX_BUTTONS) {
      throw new Error(`Zalo template buttons support at most ${MAX_BUTTONS}`)
    }
    const buttons =
      buttonsToSend.length > 0
        ? await convertZaloButtons({
            flowId: props.data.flowId,
            flowVersionId: props.data.flowVersionId,
            buttons: buttonsToSend,
            metadata: props.data.metadata,
            contactInboxId: props.data.contact.id,
          })
        : undefined
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
