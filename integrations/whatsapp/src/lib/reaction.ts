import { asString } from "./value"

export type WhatsappReaction = {
  /** The `wamid` of the message the contact reacted to. */
  messageId: string
  action: "react" | "unreact"
  emoji?: string
}

/**
 * Reads a `type: "reaction"` message item (`reaction.message_id` +
 * `reaction.emoji`). Meta sends an empty `emoji` when the contact removes the
 * reaction. Returns null for anything that is not a well-formed reaction.
 */
export const readWhatsappReaction = (
  message: unknown,
): WhatsappReaction | null => {
  if (!message || typeof message !== "object") {
    return null
  }
  const item = message as { type?: unknown; reaction?: unknown }
  if (
    item.type !== "reaction" ||
    !item.reaction ||
    typeof item.reaction !== "object"
  ) {
    return null
  }
  const reaction = item.reaction as { message_id?: unknown; emoji?: unknown }
  const messageId = asString(reaction.message_id)
  if (!messageId) {
    return null
  }
  const emoji = asString(reaction.emoji)
  return emoji
    ? { messageId, action: "react", emoji }
    : { messageId, action: "unreact" }
}
