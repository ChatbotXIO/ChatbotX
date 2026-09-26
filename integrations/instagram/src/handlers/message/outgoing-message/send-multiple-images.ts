import type { SendMultipleImagesStepSchema } from "@chatbotx.io/flow-config"
import type { SendFlowStepProps } from "@chatbotx.io/sdk"
import type { InstagramAuthValue, InstagramSendMessage } from "../../../schema"
import { withQuickReplies } from "./canonical-quick-replies"

/**
 * One Send API call carrying several bare image attachments. Unlike the
 * single-image path (`send-media.ts`), this sends the raw URL directly with no
 * pre-upload/template — Instagram accepts `payload.url` without needing an
 * `attachment_id`.
 */
export function* convertFlowStepMultipleImages(
  props: SendFlowStepProps<InstagramAuthValue, SendMultipleImagesStepSchema>,
): Generator<InstagramSendMessage> {
  const {
    data: { step },
  } = props

  yield withQuickReplies(props.data.quickReplies)({
    attachments: step.images.map((image) => ({
      type: "image" as const,
      payload: { url: image.url },
    })),
  })
}
