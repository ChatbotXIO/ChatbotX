import type { SendMultipleImagesStepSchema } from "@chatbotx.io/flow-config"
import type { SendFlowStepProps } from "@chatbotx.io/sdk"
import type { InstagramAuthValue } from "../../../schemas"

/**
 * One Send API call carrying several bare image attachments. Unlike the
 * single-image path (`send-media.ts`), this sends the raw URL directly with
 * no pre-upload/template — Instagram accepts `payload.url` without needing
 * an `attachment_id`.
 *
 * No try/catch here on purpose: a failure has to reach `sendFlowStep` so
 * `mapToChannelError` records it on the message row, rather than yielding
 * nothing and turning the step into a silent no-op.
 */
export function* convertFlowStepMultipleImages(
  props: SendFlowStepProps<InstagramAuthValue, SendMultipleImagesStepSchema>,
) {
  const {
    data: { step },
  } = props

  yield {
    attachments: step.images.map((image) => ({
      type: "image" as const,
      payload: { url: image.url },
    })),
  }
}
