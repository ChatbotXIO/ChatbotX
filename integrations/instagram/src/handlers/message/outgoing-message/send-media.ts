import type {
  SendImageStepSchema,
  SendVideoStepSchema,
} from "@chatbotx.io/flow-config"
import type { SendFlowStepProps } from "@chatbotx.io/sdk"
import { logger } from "../../../lib/logger"
import type { InstagramAuthValue } from "../../../schemas"
import { convertMediaType } from "./send-attachment"
import { convertCanonicalInstagramQuickReplies } from "./send-quick-replies"

export function* convertFlowStepMedia(
  props: SendFlowStepProps<
    InstagramAuthValue,
    SendImageStepSchema | SendVideoStepSchema
  >,
) {
  const {
    data: { step },
  } = props
  try {
    const media_type = convertMediaType(step.stepType)
    const quickReplies = props.data.quickReplies ?? []

    yield {
      attachments: [
        {
          type: media_type,
          payload: {
            url: step.url,
          },
        },
      ],
      ...(quickReplies.length > 0
        ? {
            quick_replies: convertCanonicalInstagramQuickReplies(quickReplies),
          }
        : {}),
    }
  } catch (error) {
    logger.error(error, "Error uploading media")
  }
}
