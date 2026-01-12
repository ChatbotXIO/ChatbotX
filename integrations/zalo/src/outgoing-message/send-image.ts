import {
  type SendGifStepSchema,
  type SendImageStepSchema,
  StepType,
} from "@aha.chat/flow-config"
import { uploadAttachment } from "../api/message"
import { logger } from "../libs/logger"
import type { ZaloAuthValue } from "../schemas/definition"
import type { MessageTemplate } from "../schemas/webhook"
import { convertZaloButtons } from "./send-button"

export async function* convertFlowStepImage(
  auth: ZaloAuthValue,
  flowId: string,
  flowVersionId: string,
  payload: SendImageStepSchema | SendGifStepSchema,
): AsyncGenerator<MessageTemplate> {
  try {
    if (!payload.url?.trim()) {
      throw new Error("Image URL is required")
    }

    const mediaType = payload.stepType === StepType.sendGif ? "gif" : "image"
    const {
      data: { attachment_id, width, height },
    } = await uploadAttachment(auth, mediaType, payload.url)

    if (!attachment_id) {
      throw new Error("Failed to upload image: No attachment ID received")
    }

    const buttons =
      payload.stepType === StepType.sendImage
        ? await convertZaloButtons(
            flowId,
            flowVersionId,
            (payload as SendImageStepSchema).buttons,
          )
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
