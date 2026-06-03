export {
  type CreateAttachmentInput,
  type CreateMessageInput,
  type CreateMessageResult,
  type DistributedLock,
  type FindLastByConversationOptions,
  type FindManyByConversationOptions,
  type IMessageRepository,
  type ListMessagesQuery,
  MessageRepository,
  type MessageWithAttachments,
  type PaginatedMessages,
  type Pagination,
  type PaginationCursor,
} from "./message-repository"
export * from "./message-repository.factory"

export function getSafeSinceTime(
  time: Date | number | undefined | null,
  bufferMs?: number,
): Date | undefined {
  if (!time) {
    return
  }
  const ts = time instanceof Date ? time.getTime() : time

  if (bufferMs !== undefined) {
    // Explicit buffer: subtract then floor to hour start (e.g. 1-year lookback for AI context)
    const date = new Date(ts - bufferMs)
    date.setMinutes(0, 0, 0)
    return date
  }

  // Default: floor to start of the previous hour — consistent ~1-2h lookback regardless
  // of where in the current hour the call is made, avoiding variable shard scan windows.
  const date = new Date(ts)
  date.setMinutes(0, 0, 0)
  date.setHours(date.getHours() - 1)
  return date
}
