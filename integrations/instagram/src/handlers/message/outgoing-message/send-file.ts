import type {
  SendAudioStepSchema,
  SendFileStepSchema,
} from "@chatbotx.io/flow-config"
import type { SendFlowStepProps } from "@chatbotx.io/sdk"
import { uploadAttachment } from "../../../apis/attachment"
import type { InstagramAuthValue } from "../../../schemas"
import { convertMediaType } from "./send-attachment"
import { convertCanonicalInstagramQuickReplies } from "./send-quick-replies"

/**
 * An upload failure is deliberately left to propagate: `sendFlowStep` maps it
 * through `mapToChannelError` so the inbox shows why the step failed, instead
 * of yielding nothing and skipping the step silently.
 */
export async function* convertFlowStepFile(
  props: SendFlowStepProps<
    InstagramAuthValue,
    SendAudioStepSchema | SendFileStepSchema
  >,
) {
  const {
    ctx,
    data: { step },
  } = props

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
      ? {
          quick_replies: convertCanonicalInstagramQuickReplies(quickReplies),
        }
      : {}),
  }
}
