import type { ConversationAttributes } from "@chatbotx.io/database/partials"

/**
 * Webchat taps arrive as a postback on the same message, so unlike the
 * webhook channels they are not excluded from challenge routing upstream.
 * A tap must never count as a "reply that isn't a quick reply".
 */
export function shouldRunWebchatChallenge(
  challenge: ConversationAttributes["challenge"] | undefined,
  hasPostback: boolean,
): challenge is NonNullable<ConversationAttributes["challenge"]> {
  if (!challenge) {
    return false
  }
  return !(challenge.type === "quickReply" && hasPostback)
}
