import type { SendMultipleImagesStepSchema } from "@chatbotx.io/flow-config"
import type { SendFlowStepProps } from "@chatbotx.io/sdk"
import { logger } from "../../../lib/logger"
import type { MessengerAuthValue } from "../../../schema"
import { convertCanonicalFacebookQuickReplies } from "./send-quick-replies"

/**
 * One Send API call carrying several bare image attachments — Meta's
 * "sending_multiple_attachments" form. Unlike the single-image path
 * (`send-media.ts`), this sends the raw URL directly with no pre-upload —
 * Meta accepts `payload.url` here without needing an `attachment_id`.
 */
export function* convertFlowStepMultipleImages(
  props: SendFlowStepProps<MessengerAuthValue, SendMultipleImagesStepSchema>,
) {
  const {
    data: { step },
  } = props
  try {
    const quickReplies = props.data.quickReplies ?? []
    yield {
      attachments: step.images.map((image) => ({
        type: "image" as const,
        payload: { url: image.url },
      })),
      ...(quickReplies.length > 0
        ? { quick_replies: convertCanonicalFacebookQuickReplies(quickReplies) }
        : {}),
    }
  } catch (error) {
    logger.error(error, "Error sending multiple images")
  }
}
