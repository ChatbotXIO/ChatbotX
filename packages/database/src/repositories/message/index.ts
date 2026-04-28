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
  bufferMs = 10_000,
): Date | undefined {
  if (!time) {
    return
  }

  const timestamp = time instanceof Date ? time.getTime() : time
  const date = new Date(timestamp - bufferMs)
  date.setMinutes(0, 0, 0)
  return date
}
