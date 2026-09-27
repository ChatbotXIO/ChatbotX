import type {
  SendAudioStepSchema,
  SendFileStepSchema,
} from "@chatbotx.io/flow-config"
import type { SendFlowStepProps } from "@chatbotx.io/sdk"
import { uploadAttachment } from "../../../apis/attachment"
import { logger } from "../../../lib/logger"
import type { MessengerAuthValue } from "../../../schema"
import { convertCanonicalQuickReplies } from "./canonical-quick-replies"
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
    const quickReplies = props.data.quickReplies ?? []
    yield {
      attachment: {
        type: media_type,
        payload: {
          attachment_id: attachment.attachment_id,
        },
      },
      ...(quickReplies.length > 0
        ? { quick_replies: convertCanonicalQuickReplies(quickReplies) }
        : {}),
    }
  } catch (error) {
    logger.error(error, "An error occurred while uploading the attachment")
  }
}
