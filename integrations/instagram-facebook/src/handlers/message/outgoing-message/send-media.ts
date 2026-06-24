import type {
  SendImageStepSchema,
  SendVideoStepSchema,
} from "@chatbotx.io/flow-config"
import type { SendFlowStepProps } from "@chatbotx.io/sdk"
import { uploadAttachment } from "../../../apis/attachment"
import { logger } from "../../../lib/logger"
import type { InstagramAuthValue } from "../../../schemas"
import { convertMediaType } from "./send-attachment"
import { convertInstagramButtons } from "./send-button"

export async function* convertFlowStepMedia(
  props: SendFlowStepProps<
    InstagramAuthValue,
    SendImageStepSchema | SendVideoStepSchema
  >,
) {
  const {
    ctx,
    data: { flowId, flowVersionId, step },
  } = props
  try {
    const media_type = convertMediaType(step.stepType)
    const attachment = await uploadAttachment(ctx.auth, step.url, media_type)
    const buttons = convertInstagramButtons({
      flowId,
      flowVersionId,
      buttons: step.buttons,
    })
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
    logger.error(error, "Error uploading media")
  }
}
