import type { MessageButtonTemplate } from "@chatbotx.io/sdk"
import { convertCanonicalQuickReplies } from "./canonical-quick-replies"

export function* convertFlowStepGif(
  url: string,
  quickReplies: MessageButtonTemplate[] = [],
) {
  yield {
    attachment: {
      type: "image",
      payload: {
        url,
        is_reusable: true,
      },
    },
    ...(quickReplies.length > 0
      ? { quick_replies: convertCanonicalQuickReplies(quickReplies) }
      : {}),
  }
}
