export type {
  AttachmentLookupRow,
  BulkCreateAttachmentInput,
  BulkPatchContentAttributesParams,
  CreateAttachmentInput,
  CreateMessageInput,
  CreateMessageResult,
  DistributedLock,
  FindAIContextMessagesOptions,
  FindAttachmentByIdParams,
  FindLastByConversationOptions,
  FindManyByConversationOptions,
  FindManyBySourceIdsParams,
  FindMessageByIdParams,
  FindRichResponseByButtonParams,
  FindTriggerMessageOptions,
  HardDeleteAllByContactInboxParams,
  HardDeleteAllByContactInboxResult,
  IMessageRepository,
  ListIncomingTextsByContactInboxParams,
  ListMessagesQuery,
  MessageSourceRow,
  MessageWithAttachments,
  PaginatedMessages,
  Pagination,
  PaginationCursor,
  UpdateAttachmentParams,
} from "./message-repository"
export * from "./message-repository.factory"

export function getSafeSinceTime(
  time: Date | string | number | undefined | null,
  bufferMs?: number,
): Date | undefined {
  if (!time) {
    return
  }
  // Queue payloads and JSON snapshots can turn Date values into ISO strings.
  const ts = time instanceof Date ? time.getTime() : new Date(time).getTime()
  if (!Number.isFinite(ts)) {
    return
  }

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
