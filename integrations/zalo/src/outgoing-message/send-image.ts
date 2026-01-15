import {
  type SendGifStepSchema,
  type SendImageStepSchema,
  StepType,
} from "@aha.chat/flow-config"
import type { SendFlowStepProps } from "@aha.chat/sdk"
import { uploadAttachment } from "../api/message"
import { logger } from "../libs/logger"
import type { ZaloAuthValue } from "../schemas/definition"
import type { MessageTemplate } from "../schemas/webhook"
import { convertZaloButtons } from "./send-button"

export async function* convertFlowStepImage(
  props: SendFlowStepProps<
    ZaloAuthValue,
    SendImageStepSchema | SendGifStepSchema
  >,
): AsyncGenerator<MessageTemplate> {
  const { step } = props
  try {
    if (!step.url?.trim()) {
      throw new Error("Image URL is required")
    }

    const mediaType = step.stepType === StepType.sendGif ? "gif" : "image"
    const {
      data: { attachment_id, width, height },
    } = await uploadAttachment(props.ctx.auth, mediaType, step.url)

    if (!attachment_id) {
      throw new Error("Failed to upload image: No attachment ID received")
    }

    const buttons =
      step.stepType === StepType.sendImage
        ? await convertZaloButtons({
            flowId: props.flowId,
            flowVersionId: props.flowVersionId,
            buttons: step.buttons,
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
    logger.error("Error uploading media:", JSON.stringify(error))
    throw error
  }
}
