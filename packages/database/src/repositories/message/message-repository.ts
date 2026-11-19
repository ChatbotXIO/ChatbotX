import type { RichResponseContentAttributes } from "../../schema"
import type { AttachmentModel, MessageModel } from "../../types"

/** A queued message's text plus the file types attached to it (keyword
 * rules match image/video attachments, not just text). */
export type MessageTextWithFileTypes = Pick<MessageModel, "id" | "text"> & {
  attachmentFileTypes: AttachmentModel["fileType"][]
}

export interface CreateMessageInput {
  contactInboxId: string
  contentAttributes?: Record<string, unknown> | null
  contentType: "text" | "location" | "refLink"
  conversationId: string
  createdAt?: Date
  id?: string
  messageType: "incoming" | "outgoing" | "activity"
  parentId?: string | null
  senderId?: string | null
  senderType: "bot" | "contact" | "system" | "user" | "api"
  sourceId?: string | null
  text?: string | null
  type?: "message" | "comment"
  updatedAt?: Date
  workspaceId: string
}

export interface CreateMessageResult {
  isNew: boolean
  message: MessageModel
}

export interface CreateAttachmentInput {
  conversationId: string
  createdAt?: Date
  fileType: "image" | "video" | "audio" | "gif" | "file"
  height?: number | null
  // true: never re-encode (image sent as a file). null/undefined: a photo.
  keepOriginal?: boolean | null
  messageCreatedAt: Date
  messageId: string
  mimeType: string
  name?: string | null
  originPath: string
  size?: number
  sourceId?: string | null
  thumbnailPath?: string | null
  width?: number | null
  workspaceId: string
}

export type BulkCreateAttachmentInput = CreateAttachmentInput & { id: string }

export interface MessageWithAttachments extends MessageModel {
  attachmentCount?: number
  attachments: AttachmentModel[]
}

export interface PaginationCursor {
  createdAt: Date
  id: string
  shardId?: string
}

export interface Pagination {
  cursor?: PaginationCursor
  limit: number
}

export interface PaginatedMessages {
  data: MessageWithAttachments[]
  hasPartialResults?: boolean
  nextCursor: PaginationCursor | null
}

export interface ListMessagesQuery {
  contactInboxId?: string
  conversationId?: string
  pagination: Pagination
  sinceTime?: Date
  workspaceId: string
}

export interface FindLastByConversationOptions {
  attachmentCountOnly?: boolean
  limit?: number
  messageTypes?: ("incoming" | "outgoing" | "activity")[]
  requireCompleteResults?: boolean
  sinceTime?: Date
  withAttachments?: boolean
  workspaceId: string
}

export interface FindManyByConversationOptions {
  limit: number
  messageTypes?: ("incoming" | "outgoing" | "activity")[]
  requireCompleteResults?: boolean
  sinceTime?: Date
  textNotNull?: boolean
  workspaceId: string
}

export interface FindOutgoingBeforeParams {
  /**
   * Exclusive upper bound: only messages strictly older than this
   * `(createdAt, id)` tuple. `createdAt` is timestamptz text (an ISO string, or
   * a row's `createdAtExact`), bound with `::timestamptz`, so a row's
   * microseconds are never truncated by a JS `Date`.
   */
  before: { createdAt: string; id: string }
  conversationId: string
  limit: number
  /** Inclusive lower bound on `createdAt`. */
  since: Date
  workspaceId: string
}

/** The columns a "what did the bot last send" classification needs. */
export type OutgoingBotMessage = Pick<
  MessageModel,
  "contentAttributes" | "id"
> & {
  /**
   * `createdAt` to the microsecond, as fixed-width UTC text
   * (`YYYY-MM-DDTHH:MI:SS.USZ`): sorts lexicographically and feeds back into
   * `before.createdAt` without loss. A JS `Date` is millisecond-only.
   */
  createdAtExact: string
}

export interface FindAIContextMessagesOptions {
  conversationId: string
  limit: number
  markerMessageId: string | null
  messageTypes?: ("incoming" | "outgoing" | "activity")[]
  sinceTime?: Date
  textNotNull?: boolean
  workspaceId: string
}

export interface FindTriggerMessageOptions {
  conversationId: string
  id: string
  requireCompleteResults?: boolean
  sinceTime: Date
  workspaceId: string
}

export interface FindRichResponseByButtonParams {
  buttonId: string
  contactInboxId: string
  conversationId: string
  messageId?: string
  sinceTime?: Date
  workspaceId: string
}

export interface FindMessageByIdParams {
  // Optional: when supplied, the lookup is scoped to this conversation too,
  // so a message id/createdAt pair belonging to a different conversation in
  // the same workspace returns null instead of leaking across conversations.
  conversationId?: string
  createdAt: Date
  id: string
  workspaceId: string
}

export interface FindManyBySourceIdsParams {
  contactInboxIds: string[]
  sinceTime?: Date
  sourceIds: string[]
  workspaceId: string
}

export interface FindThreadAnchorsBySourceIdsParams {
  contactInboxId: string
  sinceTime: Date
  sourceIds: string[]
  workspaceId: string
}

export interface FindEmailParentParams {
  contactInboxId: string
  conversationId: string
  /** Restrict to this message (an explicit reply target) instead of the newest. */
  messageId?: string
  sinceTime: Date
  workspaceId: string
}

export type EmailParentRow = Pick<
  MessageModel,
  "id" | "contactInboxId" | "sourceId" | "contentAttributes" | "createdAt"
>

export interface HardDeleteAllByContactInboxParams {
  contactInboxId: string
  sinceTime: Date
  workspaceId: string
}

export interface HardDeleteAllByContactInboxResult {
  attachmentPaths: string[]
}

export interface ListIncomingTextsByContactInboxParams {
  contactInboxId: string
  limit?: number
  sinceTime: Date
  workspaceId: string
}

export type MessageSourceRow = Pick<
  MessageModel,
  "id" | "conversationId" | "contactInboxId" | "sourceId" | "createdAt"
>

export interface BulkPatchContentAttributesParams {
  patches: {
    contactInboxId: string
    overlay: Record<string, unknown>
    sourceId: string
    text?: string | null
  }[]
  sinceTime?: Date
  workspaceId: string
}

export interface FindAttachmentByIdParams {
  id: string
  /**
   * Parent message createdAt. On a sharded deployment it lets the lookup target
   * the shard time-window that holds the row instead of scanning a fixed
   * recent-history range, so attachments older than that range stay reachable.
   * Ignored when sharding is disabled (the single main DB holds every row).
   */
  messageCreatedAt?: Date
  workspaceId: string
}

export type AttachmentLookupRow = Pick<
  AttachmentModel,
  | "id"
  | "messageId"
  | "messageCreatedAt"
  | "sourceId"
  | "originPath"
  | "mimeType"
  | "size"
  | "createdAt"
  | "keepOriginal"
>

export interface UpdateAttachmentParams {
  createdAt: Date
  fields: {
    height?: number
    mimeType: string
    originPath: string
    size: number
    width?: number
  }
  id: string
  workspaceId: string
}

export interface DistributedLock {
  runExclusive<T>(params: {
    key: string
    timeoutInSeconds: number
    fn: () => Promise<T>
  }): Promise<T>
}

export interface IMessageRepository {
  bulkCreate(
    messages: CreateMessageInput[],
  ): Promise<{ id: string; sourceId: string | null }[]>

  bulkCreateAttachments(
    attachments: BulkCreateAttachmentInput[],
  ): Promise<{ id: string }[]>

  bulkPatchContentAttributes(
    params: BulkPatchContentAttributesParams,
  ): Promise<void>

  /**
   * Atomically merges `overlay` into one message's `contentAttributes` via a
   * DB-side `jsonb ||` UPDATE, but only while `guardKey` is still absent — a
   * claim, for bookkeeping that must happen once per message. Two workers
   * racing on the same row: exactly one gets the row back, the other `null`.
   * Also `null` when no row matched or every shard update failed, so a `null`
   * always means "not claimed" and the caller must not act on it.
   */
  claimContentAttributes(params: {
    messageId: string
    workspaceId: string
    createdAt: Date
    guardKey: string
    overlay: Record<string, unknown>
  }): Promise<{ id: string } | null>

  /**
   * Atomically clears a failed outgoing message's `sendError` so it can be sent
   * again, only while it is still a failed send that never reached the channel
   * (`sendError IS NOT NULL AND sourceId IS NULL`). Of two concurrent callers
   * exactly one gets the row; the other (and a message that is not resendable)
   * gets `null`, and must not enqueue anything.
   */
  claimForResend(params: {
    id: string
    workspaceId: string
    createdAt: Date
  }): Promise<{ id: string } | null>

  create(message: CreateMessageInput): Promise<MessageModel>

  createOrUpdate(message: CreateMessageInput): Promise<CreateMessageResult>

  createOrUpdateWithAttachments(
    message: CreateMessageInput,
    attachments: Omit<
      CreateAttachmentInput,
      "messageId" | "messageCreatedAt"
    >[],
  ): Promise<{ result: MessageWithAttachments; isNew: boolean }>

  createWithAttachments(
    message: CreateMessageInput,
    attachments: Omit<
      CreateAttachmentInput,
      "messageId" | "messageCreatedAt"
    >[],
  ): Promise<MessageWithAttachments>

  deleteAttachmentsByMessageId(
    messageId: string,
    workspaceId: string,
    createdAt: Date,
  ): Promise<void>

  deleteById(
    id: string,
    workspaceId: string,
    createdAt: Date,
  ): Promise<{ id: string }[]>

  deleteBySourceId(
    sourceId: string,
    workspaceId: string,
    createdAt: Date,
  ): Promise<{ conversationId: string; id: string }[]>

  findAIContextMessages(
    options: FindAIContextMessagesOptions,
  ): Promise<MessageModel[]>

  findAttachmentById(
    params: FindAttachmentByIdParams,
  ): Promise<AttachmentLookupRow | null>

  findById(
    params: FindMessageByIdParams,
  ): Promise<MessageWithAttachments | null>

  findByIdForConversation(
    id: string,
    conversationId: string,
    workspaceId: string,
    sinceTime: Date,
  ): Promise<MessageWithAttachments | null>

  findBySourceId(
    sourceId: string,
    conversationId: string,
    workspaceId: string,
    sinceTime?: Date,
  ): Promise<MessageModel | null>

  /**
   * The newest delivered email message (carries a `sourceId` and `email`
   * content attributes) of one contact inbox in a conversation, or the one
   * named by `messageId`. Filters run in SQL before the limit, and reads use
   * shard primaries so a mail persisted a moment ago is visible: a replica
   * miss would reuse a Message-ID. Any unavailable shard throws.
   */
  findEmailParent(params: FindEmailParentParams): Promise<EmailParentRow | null>

  findLastByConversation(
    conversationId: string,
    options?: FindLastByConversationOptions,
  ): Promise<MessageWithAttachments[]>

  findManyByConversation(
    conversationId: string,
    options: FindManyByConversationOptions,
  ): Promise<MessageModel[]>

  findManyByIds(
    ids: string[],
    contactInboxId: string,
    sinceTime?: Date,
    workspaceId?: string,
  ): Promise<MessageTextWithFileTypes[]>

  findManyBySourceIds(
    params: FindManyBySourceIdsParams,
  ): Promise<MessageSourceRow[]>

  /**
   * One bounded page, newest first, of the bot/system messages that were
   * really sent (`sendError IS NULL`) before the `before` tuple. A failing
   * shard throws: a decision must never rest on partial history.
   */
  findOutgoingBefore(
    params: FindOutgoingBeforeParams,
  ): Promise<OutgoingBotMessage[]>

  findRichResponseByButton(
    params: FindRichResponseByButtonParams,
  ): Promise<RichResponseContentAttributes | null>

  /**
   * Finds email thread anchors from shard primaries so a just-persisted parent
   * is immediately visible. Any unavailable shard fails the whole lookup.
   */
  findThreadAnchorsBySourceIds(
    params: FindThreadAnchorsBySourceIdsParams,
  ): Promise<MessageSourceRow[]>

  findTriggerMessage(
    options: FindTriggerMessageOptions,
  ): Promise<MessageWithAttachments | null>

  hardDeleteAllByContactInbox(
    params: HardDeleteAllByContactInboxParams,
  ): Promise<HardDeleteAllByContactInboxResult>

  /**
   * Permanently removes one message and its attachment rows (no `deletedAt`
   * tombstone — the inbox would render a soft-deleted row as "The message has
   * been deleted."). Returns the ids of the message rows removed. Throws when a
   * shard fails, so the caller never reports a delete that did not happen.
   */
  hardDeleteById(
    id: string,
    workspaceId: string,
    createdAt: Date,
  ): Promise<{ id: string }[]>

  /** Whether a message already carries an attachment of this type — lets a
   * retryable pipeline re-run its attach step without duplicating the file. */
  hasAttachmentOfType(props: {
    workspaceId: string
    messageId: string
    messageCreatedAt: Date
    fileType: BulkCreateAttachmentInput["fileType"]
  }): Promise<boolean>

  listByConversation(query: ListMessagesQuery): Promise<PaginatedMessages>

  listIncomingTextsByContactInbox(
    params: ListIncomingTextsByContactInboxParams,
  ): Promise<string[]>

  /**
   * Atomically merges `overlay` into `contentAttributes` via a DB-side `jsonb ||`
   * UPDATE, never read-modify-write — two webhooks racing on disjoint keys (e.g.
   * `hasRecording` vs `hasTranscript`) each merge without clobbering the other.
   * Returns the merged `contentAttributes`, or `null` if no row matched.
   */
  mergeContentAttributesBySourceId(
    sourceId: string,
    workspaceId: string,
    overlay: Record<string, unknown>,
  ): Promise<{
    id: string
    contentAttributes: Record<string, unknown> | null
  } | null>

  /**
   * Returns how many rows were updated: 0 means no row matched, so callers
   * that just wrote an object for this row must treat it as a failure.
   */
  updateAttachment(params: UpdateAttachmentParams): Promise<number>

  /**
   * Replaces `contentAttributes` wholesale — it is NOT a merge. Callers hold
   * the row already and must spread the attributes they want to keep, or they
   * will drop `postId` and break `{{last_post_id}}`.
   */
  updateContentAttributes(
    messageId: string,
    workspaceId: string,
    contentAttributes: Record<string, unknown>,
    createdAt: Date,
  ): Promise<{ id: string } | null>

  updateContentBySourceId(
    sourceId: string,
    workspaceId: string,
    patch: {
      text?: string | null
      contentAttributes?: Record<string, unknown> | null
    },
  ): Promise<{ id: string } | null>

  updateMessageAttributes(
    messageId: string,
    workspaceId: string,
    attributes: { liked: boolean; hidden: boolean },
    createdAt: Date,
  ): Promise<{ id: string } | null>

  updateMessageText(
    messageId: string,
    workspaceId: string,
    newText: string,
    createdAt: Date,
  ): Promise<{ conversationId: string; id: string } | null>

  updateSendError(
    id: string,
    sendError: string | null,
    workspaceId: string,
    createdAt: Date,
  ): Promise<{ id: string } | null>

  updateSourceId(
    id: string,
    sourceId: string,
    workspaceId: string,
    createdAt: Date,
  ): Promise<{ id: string } | null>

  updateSourceIdAndEmail(
    id: string,
    sourceId: string,
    email: Record<string, unknown>,
    workspaceId: string,
    createdAt: Date,
  ): Promise<{ id: string } | null>

  updateTextBySourceId(
    sourceId: string,
    workspaceId: string,
    newText: string,
  ): Promise<{ conversationId: string; id: string } | null>
}
