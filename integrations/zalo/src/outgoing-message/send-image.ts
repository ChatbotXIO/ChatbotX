import type { SendImageStepSchema } from "@aha.chat/flow-config"
import { uploadAttachment } from "../api/message"
import { logger } from "../libs/logger"
import type { ZaloAuthValue } from "../schemas/definition"
import type { MessageTemplate } from "../schemas/webhook"
import { convertZaloButtons } from "./send-button"

export async function* convertFlowStepImage(
  auth: ZaloAuthValue,
  flowVersionId: string,
  payload: SendImageStepSchema,
): AsyncGenerator<MessageTemplate> {
  try {
    if (!payload.url?.trim()) {
      throw new Error("Image URL is required")
    }

    const {
      data: { attachment_id },
    } = await uploadAttachment(auth, "image", payload.url)

    if (!attachment_id) {
      throw new Error("Failed to upload image: No attachment ID received")
    }

    const buttons = await convertZaloButtons(flowVersionId, payload.buttons)
    yield {
      attachment: {
        type: "template",
        payload: {
          template_type: "media",
          elements: [
            {
              media_type: "image",
              attachment_id,
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
