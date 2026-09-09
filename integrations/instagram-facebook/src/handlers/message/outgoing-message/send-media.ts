import type {
  SendImageStepSchema,
  SendVideoStepSchema,
} from "@chatbotx.io/flow-config"
import type { SendFlowStepProps } from "@chatbotx.io/sdk"
import { logger } from "../../../lib/logger"
import type { InstagramAuthValue, InstagramSendMessage } from "../../../schemas"
import { convertMediaType, getAttachmentTemplate } from "./send-attachment"

/**
 * An image or video goes out as a bare attachment — the shape the inbox
 * `sendMessage` path already uses for a single media file.
 *
 * The step's buttons are deliberately dropped. Instagram cannot attach buttons
 * to a media message: the only way to pair the two is a template, and a
 * template *replaces* the media with its own rendering. Every option is worse
 * than sending the media plain — `template_type: "media"` does not exist on
 * Instagram (it comes back as `100 / 2534015 Invalid message data`), a generic
 * element renders a video as a still frame and needs a fake `title` an
 * image/video step has no caption field to fill, and Meta documents both the
 * generic and the button template as "not available in the web version". So
 * the media stays media. Buttons that matter belong on a following `sendText`
 * step, which does carry them (`send-text.ts`, button template).
 *
 * A dropped button set is logged rather than discarded quietly: a flow whose
 * next node waits on one of those postbacks will stall, and that has to be
 * diagnosable from the logs.
 *
 * No try/catch here on purpose: a failure has to reach `sendFlowStep` so
 * `mapToChannelError` records it on the message row, instead of yielding
 * nothing and turning the step into a silent no-op.
 */
export function* convertFlowStepMedia(
  props: SendFlowStepProps<
    InstagramAuthValue,
    SendImageStepSchema | SendVideoStepSchema
  >,
): Generator<InstagramSendMessage> {
  const {
    data: { step },
  } = props

  if (step.buttons.length > 0) {
    logger.warn(
      {
        stepId: step.id,
        stepType: step.stepType,
        buttonCount: step.buttons.length,
      },
      "Instagram cannot attach buttons to a media message — sending the media without them",
    )
  }

  yield {
    attachment: getAttachmentTemplate(
      step.url,
      convertMediaType(step.stepType),
    ),
  }
}
