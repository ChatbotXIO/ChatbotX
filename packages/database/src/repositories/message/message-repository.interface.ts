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
  workspaceId: string
}

export interface FindLastByConversationOptions {
  limit?: number
  messageTypes?: ("incoming" | "outgoing" | "activity")[]
  sinceTime?: Date
  withAttachments?: boolean
}

export interface FindManyByConversationOptions {
  limit: number
  messageTypes?: ("incoming" | "outgoing" | "activity")[]
  sinceTime?: Date
  textNotNull?: boolean
}

export interface DistributedLock {
  runExclusive<T>(params: {
    key: string
    timeoutInSeconds: number
    fn: () => Promise<T>
  }): Promise<T>
}

export interface MessageRepository {
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

  findById(id: string, createdAt?: Date): Promise<MessageWithAttachments | null>

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
  ): Promise<Pick<MessageModel, "id" | "text">[]>

  listByConversation(query: ListMessagesQuery): Promise<PaginatedMessages>
}
