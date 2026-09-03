import type {
  SendImageStepSchema,
  SendVideoStepSchema,
} from "@chatbotx.io/flow-config"
import type { SendFlowStepProps } from "@chatbotx.io/sdk"
import type { FacebookMessage, MessengerAuthValue } from "../../../schema"
import { convertMediaType, getAttachmentTemplate } from "./send-attachment"
import { convertFlowStepMedia } from "./send-media"
import { convertCanonicalFacebookQuickReplies } from "./send-quick-replies"

type MediaStepProps = SendFlowStepProps<
  MessengerAuthValue,
  SendImageStepSchema | SendVideoStepSchema
>

type MediaConverter = (
  props: MediaStepProps,
) => AsyncGenerator<FacebookMessage> | Generator<FacebookMessage>

const mediaDeliveryModes = {
  inline: "inline",
  mediaTemplate: "mediaTemplate",
} as const
type MediaDeliveryMode =
  (typeof mediaDeliveryModes)[keyof typeof mediaDeliveryModes]

const resolveMediaDeliveryMode = (
  step: MediaStepProps["data"]["step"],
): MediaDeliveryMode =>
  step.buttons.length > 0
    ? mediaDeliveryModes.mediaTemplate
    : mediaDeliveryModes.inline

function* convertInlineMedia(
  props: MediaStepProps,
): Generator<FacebookMessage> {
  const { step, quickReplies = [] } = props.data
  yield {
    attachment: getAttachmentTemplate(
      step.url,
      convertMediaType(step.stepType),
    ),
    ...(quickReplies.length > 0
      ? { quick_replies: convertCanonicalFacebookQuickReplies(quickReplies) }
      : {}),
  }
}

const mediaConverters: Record<MediaDeliveryMode, MediaConverter> = {
  inline: convertInlineMedia,
  mediaTemplate: convertFlowStepMedia,
}

/**
 * A single image/video step is sent inline (`attachment.payload.url`; Meta
 * fetches the file and embeds it in the thread). A step with buttons keeps
 * the existing media-template converter: a plain attachment cannot carry
 * buttons, the generic template needs a title this step does not have and
 * cannot show a video by URL, and the media template rejects external URLs,
 * hence its upload → `attachment_id` round-trip.
 */
export async function* convertFlowStepMediaV2(
  props: MediaStepProps,
): AsyncGenerator<FacebookMessage> {
  yield* mediaConverters[resolveMediaDeliveryMode(props.data.step)](props)
}
