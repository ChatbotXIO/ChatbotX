import type { SendFlowStepProps } from "@chatbotx.io/sdk"
import type { InstagramAuthValue, InstagramSendMessage } from "../../../schema"
import { toMediaShareAttachment } from "./send-attachment"

/**
 * A `sendChannelPost` step shares the post by its platform id. The worker
 * resolves that id before it hands the step over (the persisted step stores the
 * ChatbotX post id only); a step that reaches here without one is a bug in the
 * caller, so it fails loudly instead of sending nothing.
 *
 * No try/catch on purpose: a failure has to reach `sendFlowStep` so
 * `mapToChannelError` records it on the message row.
 */
export function* convertFlowStepChannelPost(
  props: SendFlowStepProps<InstagramAuthValue>,
): Generator<InstagramSendMessage> {
  const { step } = props.data
  if (!("externalPostId" in step && typeof step.externalPostId === "string")) {
    throw new Error("sendChannelPost reached Instagram without a resolved post")
  }
  yield { attachment: toMediaShareAttachment(step.externalPostId) }
}
