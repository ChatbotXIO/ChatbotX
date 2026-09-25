import type { RichResponseContentAttributes } from "../../schema"
import type { AttachmentModel, MessageModel } from "../../types"

export interface CreateMessageInput {
  contactInboxId: string
  contentAttributes?: Record<string, unknown> | null
  contentType: "text" | "location" | "refLink"
  conversationId: string
  createdAt?: Date
  id?: string
  messageType: "incoming" | "outgoing" | "activity"
  senderId?: string | null
  senderType: "bot" | "contact" | "system" | "user" | "api"
  sourceId?: string | null
  text?: string | null
  updatedAt?: Date
  workspaceId: string
}

export interface CreateMessageResult {
  isNew: boolean
  message: MessageModel
}

export interface CreateOrUpdateMessageOptions {
  /**
   * Skip the distributed dedup lock while retaining the cross-shard guard read.
   * Safe only when the caller guarantees a channel-authoritative `createdAt`,
   * so a concurrent duplicate job collides on the unique key instead of
   * relying on the lock.
   */
  skipDedupLock?: boolean
}

export interface CreateAttachmentInput {
  conversationId: string
  createdAt?: Date
  fileType: "image" | "video" | "audio" | "gif" | "file"
  height?: number | null
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
  strict?: boolean
  workspaceId: string
}

export interface FindManyOnWriteShardBySourceIdsParams {
  contactInboxIds: string[]
  sinceTime: Date
  sourceIds: string[]
  workspaceId: string
}

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
  | "createdAt"
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
  bulkCreate(messages: CreateMessageInput[]): Promise<MessageModel[]>

  bulkCreateAttachments(
    attachments: BulkCreateAttachmentInput[],
  ): Promise<AttachmentModel[]>

  bulkPatchContentAttributes(
    params: BulkPatchContentAttributesParams,
  ): Promise<void>

  create(message: CreateMessageInput): Promise<MessageModel>

  createOrUpdate(
    message: CreateMessageInput,
    options?: CreateOrUpdateMessageOptions,
  ): Promise<CreateMessageResult>

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
  ): Promise<{ id: string }[]>

  findAIContextMessages(
    options: FindAIContextMessagesOptions,
  ): Promise<MessageModel[]>

  findAttachmentById(
    params: FindAttachmentByIdParams,
  ): Promise<AttachmentLookupRow | null>

  findAttachmentSourceIdsByMessageIds(params: {
    workspaceId: string
    messages: Array<{ messageId: string; messageCreatedAt: Date }>
  }): Promise<
    Array<{
      messageId: string
      messageCreatedAt: Date
      sourceId: string | null
    }>
  >

  findById(
    params: FindMessageByIdParams,
  ): Promise<MessageWithAttachments | null>

  findBySourceId(
    sourceId: string,
    conversationId: string,
    workspaceId: string,
    sinceTime?: Date,
  ): Promise<MessageModel | null>

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
  ): Promise<Pick<MessageModel, "id" | "text">[]>

  findManyBySourceIds(
    params: FindManyBySourceIdsParams,
  ): Promise<MessageSourceRow[]>

  findManyOnWriteShardBySourceIds(
    params: FindManyOnWriteShardBySourceIdsParams,
  ): Promise<MessageSourceRow[]>

  findRichResponseByButton(
    params: FindRichResponseByButtonParams,
  ): Promise<RichResponseContentAttributes | null>

  findTriggerMessage(
    options: FindTriggerMessageOptions,
  ): Promise<MessageWithAttachments | null>

  hardDeleteAllByContactInbox(
    params: HardDeleteAllByContactInboxParams,
  ): Promise<HardDeleteAllByContactInboxResult>

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

  updateAttachment(params: UpdateAttachmentParams): Promise<void>

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
  ): Promise<{ id: string } | null>

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

  updateTextBySourceId(
    sourceId: string,
    workspaceId: string,
    newText: string,
  ): Promise<{ id: string } | null>
}
