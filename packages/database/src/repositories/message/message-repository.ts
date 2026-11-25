import { z } from "zod"
import type { RichResponseContentAttributes } from "../../schema"
import type { AttachmentModel, MessageModel } from "../../types"

/** A queued message's text plus the file types attached to it (keyword
 * rules match image/video attachments, not just text). */
export type MessageTextWithFileTypes = Pick<MessageModel, "id" | "text"> & {
  attachmentFileTypes: AttachmentModel["fileType"][]
}

/** A message reference as stored on `MessageTranslation` / job payloads. */
export type MessageRef = { id: string; createdAt: Date }

/** The columns translation needs to decide whether, and what, to translate. */
export type MessageForTranslation = Pick<
  MessageModel,
  | "id"
  | "createdAt"
  | "conversationId"
  | "contactInboxId"
  | "contentType"
  | "text"
  | "deletedAt"
  | "type"
> & {
  /** `Message.messageType`: `incoming` | `outgoing` | `activity`. */
  direction: MessageModel["messageType"]
}

/** One earlier customer message, handed to the translator as language context. */
export type TranslationContextMessage = {
  id: string
  createdAt: Date
  text: string
}

/** The closed set of attribute keys that mark one message-quota charge as taken. */
export const messageQuotaMarkerKeys = z.enum([
  "quotaChargedHide",
  "quotaChargedSkip",
])
export type MessageQuotaMarkerKey = z.infer<typeof messageQuotaMarkerKeys>

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
  /**
   * `createdAt` as PostgreSQL prints it (microseconds, with offset). A comment
   * page keeps this so its keyset compares exactly: a `Date` holds milliseconds
   * and would skip or repeat rows created within the same millisecond.
   */
  createdAtText?: string
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

/** Which comments of which conversations to list. */
export interface CommentListFilter {
  /**
   * Only comments whose `contactInboxId` is one of these: a post is its inbox's,
   * so a contact who also reaches us through another inbox never leaks that
   * inbox's comments in.
   */
  contactInboxIds: string[]
  /** The conversations whose comments are listed (one per commenter of a post). */
  conversationIds: string[]
  /** Only comments that carry a phone number (the shared phone rule). */
  hasPhone?: boolean
  /**
   * Search the text as a viewer without phone permission sees it: phone numbers
   * masked first, so a search can never probe one (also not with separators).
   */
  redactPhones?: boolean
  /** Case-insensitive substring of the comment text. */
  search?: string
}

export interface ListCommentsQuery {
  filter: CommentListFilter
  pagination: Pagination
  sinceTime?: Date
  workspaceId: string
}

/** A listed comment with its exact creation instant, for the next page's cursor. */
export type ListedComment = MessageModel & { createdAtText: string }

export interface PaginatedComments {
  data: ListedComment[]
  hasPartialResults?: boolean
  nextCursor: PaginationCursor | null
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

  /**
   * Claims a message-quota marker on a comment, atomically: `true` only for the
   * call that set it, `false` when it was already set (or the comment is gone).
   * A storage failure throws, so a caller never takes "could not write" for
   * "already charged".
   */
  claimQuotaMarker(
    messageId: string,
    workspaceId: string,
    createdAt: Date,
    key: MessageQuotaMarkerKey,
  ): Promise<boolean>

  /**
   * Counts the comments the filter matches, stopping at `limit` (`capped` is
   * then true and `count` is only a lower bound). Bounded on purpose: it backs a
   * repair of a counter, not a report.
   */
  countComments(query: {
    filter: CommentListFilter
    limit: number
    workspaceId: string
  }): Promise<{ capped: boolean; count: number }>

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

  /**
   * The newest `limit` inbound direct-text messages of a conversation created
   * strictly before `before` (and not older than `sinceTime`), newest first.
   * Language context for the translator; served by
   * `Message_conversation_history_idx`.
   */
  findInboundTextBefore(params: {
    workspaceId: string
    conversationId: string
    before: Date
    sinceTime: Date
    limit: number
  }): Promise<TranslationContextMessage[]>

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
   * Reads messages by `{ id, createdAt }` (the shard key) for translation.
   * Unlike `findManyByIds` it needs no contact inbox or `sinceTime`, and it
   * returns `type`/`contentType`/`deletedAt` so the caller can filter. Always
   * scoped by `workspaceId`. Missing messages are simply absent; a failing
   * shard throws, so an unreadable message is never mistaken for a deleted one.
   */
  findManyForTranslation(
    workspaceId: string,
    refs: MessageRef[],
  ): Promise<MessageForTranslation[]>

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

  /**
   * One newest-first keyset page of the comments of a set of conversations
   * (removed comments excluded), for the comments of a post.
   */
  listComments(query: ListCommentsQuery): Promise<PaginatedComments>

  listIncomingTextsByContactInbox(
    params: ListIncomingTextsByContactInboxParams,
  ): Promise<string[]>

  /**
   * Marks a comment as counted in its post's phone-number count, atomically:
   * `true` only for the call that set the mark, `false` when it was already set
   * (or the comment is gone). A storage failure throws, so a caller never takes
   * "could not write" for "already counted".
   */
  markPhoneCounted(
    messageId: string,
    workspaceId: string,
    createdAt: Date,
  ): Promise<boolean>

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
   * Sets only the given keys of a message's `attributes` with one JSON merge in
   * the database, so a key written concurrently (`phoneCounted`) survives.
   */
  patchMessageAttributes(
    messageId: string,
    workspaceId: string,
    patch: { hidden?: boolean; liked?: boolean },
    createdAt: Date,
  ): Promise<{ id: string } | null>

  /** Takes a claimed message-quota marker back; a storage failure throws. */
  releaseQuotaMarker(
    messageId: string,
    workspaceId: string,
    createdAt: Date,
    key: MessageQuotaMarkerKey,
  ): Promise<void>

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
    attributes: { liked: boolean; hidden: boolean; phoneCounted?: boolean },
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
