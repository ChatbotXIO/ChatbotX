import type {
  SendAudioStepSchema,
  SendFileStepSchema,
  SendVideoStepSchema,
} from "@aha.chat/flow-config"
import { uploadAttachment } from "../apis/attachment"
import { logger } from "../lib/logger"
import type { MessengerAuthValue } from "../schemas"
import { convertMediaType } from "./send-attachment"

export async function* convertFlowStepFile(
  auth: MessengerAuthValue,
  payload: SendAudioStepSchema | SendFileStepSchema | SendVideoStepSchema,
) {
  try {
    const media_type = convertMediaType(payload.stepType)
    const attachment = await uploadAttachment(auth, payload.url, media_type)
    yield {
      attachment: {
        type: media_type,
        payload: {
          attachment_id: attachment.attachment_id,
        },
      },
    }
  } catch (error) {
    logger.error(
      "An error occurred while uploading the attachment",
      JSON.stringify(error),
    )
  }
}
