import type { SendMultipleImagesStepSchema } from "@chatbotx.io/flow-config"
import type { SendFlowStepProps } from "@chatbotx.io/sdk"
import { logger } from "../../../lib/logger"
import type { InstagramAuthValue } from "../../../schemas"

/**
 * One Send API call carrying several bare image attachments. Unlike the
 * single-image path (`send-media.ts`), this sends the raw URL directly with
 * no pre-upload/template — Instagram accepts `payload.url` without needing
 * an `attachment_id`.
 */
export function* convertFlowStepMultipleImages(
  props: SendFlowStepProps<InstagramAuthValue, SendMultipleImagesStepSchema>,
) {
  const {
    data: { step },
  } = props
  try {
    yield {
      attachments: step.images.map((image) => ({
        type: "image" as const,
        payload: { url: image.url },
      })),
    }
  } catch (error) {
    logger.error(error, "Error sending multiple images")
  }
}
