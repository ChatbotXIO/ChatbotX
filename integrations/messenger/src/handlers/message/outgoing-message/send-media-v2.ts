import type {
  SendImageStepSchema,
  SendVideoStepSchema,
} from "@chatbotx.io/flow-config"
import type { SendFlowStepProps } from "@chatbotx.io/sdk"
import { logger } from "../../../lib/logger"
import type { FacebookMessage, MessengerAuthValue } from "../../../schema"
import { convertCanonicalQuickReplies } from "./canonical-quick-replies"
import { convertMediaType, getAttachmentTemplate } from "./send-attachment"
import { convertButtons } from "./send-button"
import { convertFlowStepMedia } from "./send-media"

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
  imageCard: "imageCard",
} as const
type MediaDeliveryMode =
  (typeof mediaDeliveryModes)[keyof typeof mediaDeliveryModes]

/**
 * How a step that carries buttons is delivered, by step type. To send images
 * as media templates again (once Meta fixes the limitation described on
 * `convertImageCard`), map `sendImage` back to `mediaTemplate`.
 */
const buttonedMediaDeliveryModes: Record<
  MediaStepProps["data"]["step"]["stepType"],
  MediaDeliveryMode
> = {
  sendImage: mediaDeliveryModes.imageCard,
  sendVideo: mediaDeliveryModes.mediaTemplate,
}

const resolveMediaDeliveryMode = (
  step: MediaStepProps["data"]["step"],
): MediaDeliveryMode =>
  step.buttons.length > 0
    ? buttonedMediaDeliveryModes[step.stepType]
    : mediaDeliveryModes.inline

// Meta's documented limit for a generic template element title.
const MAX_CARD_TITLE_LENGTH = 80
const CARD_TITLE_SEPARATOR = " - "

/**
 * Joins the button titles and cuts the result to Meta's limit, counting code
 * points like the PHP v1 `mb_substr`, so a surrogate pair is never split.
 */
const buildCardTitle = (buttonTitles: string[]): string =>
  Array.from(buttonTitles.join(CARD_TITLE_SEPARATOR))
    .slice(0, MAX_CARD_TITLE_LENGTH)
    .join("")

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
      ? { quick_replies: convertCanonicalQuickReplies(quickReplies) }
      : {}),
  }
}

/**
 * WORKAROUND for a Meta limitation on image steps with buttons. Tested
 * against the Graph API:
 * - media template + `attachment_id`: accepted, but recipients with no role on
 *   the Page see "Unsupported attachment";
 * - media template + external `url`: rejected (subcode 2018185);
 * - generic template + `image_url`: works.
 * So an image with buttons goes out as a one-element generic template (a card)
 * and nothing is uploaded. A generic element requires a title, which an image
 * step lacks, so it is built from the button titles. Video has no card form
 * for an external URL and keeps the media template.
 *
 * To switch back when Meta fixes this, map `sendImage` to `mediaTemplate` in
 * `buttonedMediaDeliveryModes`; `convertFlowStepMedia` was left untouched.
 */
function* convertImageCard(props: MediaStepProps): Generator<FacebookMessage> {
  const { step, quickReplies = [] } = props.data
  // A label such as `{{order_name}}` can resolve to "" at send time, and Meta
  // requires a title on every button. Dropping blanks before the cap means the
  // cap applies to buttons that can actually be sent.
  const buttons =
    convertButtons({
      flowId: props.data.flowId,
      flowVersionId: props.data.flowVersionId,
      buttons: step.buttons.filter((button) => button.label.trim().length > 0),
      metadata: props.data.metadata,
      contactInboxId: props.data.contact.id,
    }) ?? []
  if (buttons.length === 0) {
    // A card needs a title built from usable buttons; the plain image is still
    // deliverable.
    logger.warn(
      { stepId: step.id },
      "Image card has no button with a label; sending the image without buttons",
    )
    yield* convertInlineMedia(props)
    return
  }
  const title = buildCardTitle(buttons.map((button) => button.title))
  yield {
    attachment: {
      type: "template",
      payload: {
        template_type: "generic",
        image_aspect_ratio: "square",
        elements: [{ title, image_url: step.url, buttons }],
      },
    },
    ...(quickReplies.length > 0
      ? { quick_replies: convertCanonicalQuickReplies(quickReplies) }
      : {}),
  }
}

const mediaConverters: Record<MediaDeliveryMode, MediaConverter> = {
  inline: convertInlineMedia,
  mediaTemplate: convertFlowStepMedia,
  imageCard: convertImageCard,
}

/**
 * A single image/video step is sent inline (`attachment.payload.url`; Meta
 * fetches the file and embeds it in the thread). A plain attachment cannot
 * carry buttons, so a step with buttons is an image card (see
 * `convertImageCard`) or, for video, the existing media-template converter
 * (upload → `attachment_id`, since the media template rejects external URLs).
 */
export async function* convertFlowStepMediaV2(
  props: MediaStepProps,
): AsyncGenerator<FacebookMessage> {
  yield* mediaConverters[resolveMediaDeliveryMode(props.data.step)](props)
}
