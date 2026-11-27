import { resolveMessageAuthorUserId } from "@chatbotx.io/database/partials"
import type { MessageResource } from "../schema/resource"

type AuthoredMessage = Pick<
  MessageResource,
  | "id"
  | "createdAt"
  | "senderType"
  | "senderId"
  | "contentAttributes"
  | "messageType"
  | "deletedAt"
>

// A message that arrived over realtime carries `createdAt` as the ISO string
// of the wire frame, not a `Date` (the store does the same `new Date(...)`).
const timeOf = (message: AuthoredMessage): number =>
  new Date(message.createdAt).getTime()

const isNewer = (candidate: AuthoredMessage, current: AuthoredMessage) => {
  const delta = timeOf(candidate) - timeOf(current)
  return delta > 0 || (delta === 0 && candidate.id > current.id)
}

/**
 * Maps each workspace member to the id of their latest outgoing message among
 * the loaded ones — the message that carries the member's avatar. Independent
 * of the order of `messages` (the store appends and prepends), so a realtime
 * append, an older page or an optimistic replacement all give the same answer.
 * Deleted rows and rows with no member behind them are skipped.
 */
export const findLatestMessageIdByAuthor = (
  messages: readonly AuthoredMessage[],
): ReadonlyMap<string, string> => {
  const latestByAuthor = new Map<string, AuthoredMessage>()
  for (const message of messages) {
    if (message.messageType !== "outgoing" || message.deletedAt) {
      continue
    }
    const authorId = resolveMessageAuthorUserId(message)
    if (!authorId) {
      continue
    }
    const latest = latestByAuthor.get(authorId)
    if (!latest || isNewer(message, latest)) {
      latestByAuthor.set(authorId, message)
    }
  }
  return new Map(
    [...latestByAuthor].map(([authorId, message]) => [authorId, message.id]),
  )
}
