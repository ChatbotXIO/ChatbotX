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
  conversationId?: string
  pagination: Pagination
  sinceTime?: Date
  workspaceId: string
}

export interface FindLastByConversationOptions {
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

export interface FindMessageByIdParams {
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
  workspaceId: string
}

export type AttachmentLookupRow = Pick<
  AttachmentModel,
  "id" | "originPath" | "mimeType" | "createdAt"
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
  ): Promise<{ id: string }[]>

  findAIContextMessages(
    options: FindAIContextMessagesOptions,
  ): Promise<MessageModel[]>

  findAttachmentById(
    params: FindAttachmentByIdParams,
  ): Promise<AttachmentLookupRow | null>

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

  findTriggerMessage(
    options: FindTriggerMessageOptions,
  ): Promise<MessageWithAttachments | null>

  listByConversation(query: ListMessagesQuery): Promise<PaginatedMessages>

  updateAttachment(params: UpdateAttachmentParams): Promise<void>

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

  updateSourceId(
    id: string,
    sourceId: string,
    workspaceId: string,
  ): Promise<void>

  updateTextBySourceId(
    sourceId: string,
    workspaceId: string,
    newText: string,
  ): Promise<{ id: string } | null>
}
