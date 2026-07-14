import { getSafeSinceTime } from "@chatbotx.io/database/repositories"

/**
 * Full-history lower bound used when no usable anchor is available.
 */
const FULL_HISTORY_SINCE = new Date(0)

/**
 * Resolve the `sinceTime` window for a sharded last-message lookup.
 *
 * Sharded reads (findLastByConversation) need a lower-bound time window to limit
 * which shards/chunks are scanned. Callers must pass an anchor that is
 * guaranteed to be no later than the conversation's actual last message —
 * e.g. `conversation.lastActivityAt` — so the window never excludes real rows.
 * Do NOT anchor on a contactInbox's `lastMessageAt`: contactInboxes are
 * joined by contactId only (not conversationId), so a contact with multiple
 * channels/conversations can surface a sibling conversation's more recent
 * `lastMessageAt`, producing a window that filters out this conversation's
 * real last message.
 *
 * @param anchorTime A time no later than the target message(s), or
 *   null/undefined when unknown (falls back to a full-history scan).
 * @param transform Optional transform applied to the anchor before flooring
 *   (e.g. `endOfHour` to widen the upper edge).
 */
export function resolveLastMessageSinceTime(
  anchorTime: Date | null | undefined,
  transform: (date: Date) => Date = (date) => date,
): Date {
  if (!anchorTime) {
    return FULL_HISTORY_SINCE
  }
  return getSafeSinceTime(transform(anchorTime)) ?? FULL_HISTORY_SINCE
}
