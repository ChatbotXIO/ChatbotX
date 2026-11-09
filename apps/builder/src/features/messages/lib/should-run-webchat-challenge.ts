import type { ConversationAttributes } from "@chatbotx.io/database/partials"

/**
 * Webchat taps arrive as a postback on the same message, so unlike the
 * webhook channels they are not excluded from challenge routing upstream.
 * A tap must never count as a "reply that isn't a quick reply". A step's Skip
 * tap is resolved by its own job, so it is never a typed reply either.
 */
export function shouldRunWebchatChallenge(
  challenge: ConversationAttributes["challenge"] | undefined,
  hasPostback: boolean,
  isStepInputSkipTap = false,
): challenge is NonNullable<ConversationAttributes["challenge"]> {
  if (!challenge || isStepInputSkipTap) {
    return false
  }
  return !(challenge.type === "quickReply" && hasPostback)
}
