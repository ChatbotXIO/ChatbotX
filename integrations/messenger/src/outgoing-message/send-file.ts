import type {
  SendAudioStepSchema,
  SendFileStepSchema,
} from "@aha.chat/flow-config"
import type { SendFlowStepProps } from "@aha.chat/sdk"
import { uploadAttachment } from "../apis/attachment"
import { logger } from "../lib/logger"
import type { MessengerAuthValue } from "../schemas"
import { convertMediaType } from "./send-attachment"

export async function* convertFlowStepFile(
  props: SendFlowStepProps<
    MessengerAuthValue,
    SendAudioStepSchema | SendFileStepSchema
  >,
) {
  const {
    ctx,
    data: { step },
  } = props
  try {
    const media_type = convertMediaType(step.stepType)
    const attachment = await uploadAttachment(ctx.auth, step.url, media_type)
    yield {
      attachment: {
        type: media_type,
        payload: {
          attachment_id: attachment.attachment_id,
        },
      },
    }
  } catch (error) {
    logger.error(error, "An error occurred while uploading the attachment")
  }
}
