import type {
  SendImageStepSchema,
  SendVideoStepSchema,
} from "@aha.chat/flow-config"
import { uploadAttachment } from "../apis/attachment"
import { logger } from "../lib/logger"
import type { MessengerAuthValue } from "../schemas"
import { convertMediaType } from "./send-attachment"
import { convertFacebookButtons } from "./send-button"

export async function* convertFlowStepMedia(
  auth: MessengerAuthValue,
  flowId: string,
  flowVersionId: string,
  payload: SendImageStepSchema | SendVideoStepSchema,
) {
  try {
    const media_type = convertMediaType(payload.stepType)
    const attachment = await uploadAttachment(auth, payload.url, media_type)
    const buttons = convertFacebookButtons(
      flowId,
      flowVersionId,
      payload.buttons,
    )
    yield {
      attachment: {
        type: "template" as const,
        payload: {
          template_type: "media" as const,
          elements: [
            {
              media_type,
              attachment_id: attachment.attachment_id,
              buttons,
            },
          ],
        },
      },
    }
  } catch (error) {
    logger.error("Error uploading media:", JSON.stringify(error))
  }
}
