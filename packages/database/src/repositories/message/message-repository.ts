import { and, desc, eq, gte, inArray, isNotNull, lt, or } from "drizzle-orm"
import type { DatabaseClient } from "../../client"
import { attachmentModel, messageModel } from "../../schema"
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
  sinceTime?: Date
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

export interface IMessageRepository {
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

export class MessageRepository implements IMessageRepository {
  private readonly db: DatabaseClient

  constructor(db: DatabaseClient) {
    this.db = db
  }

  async create(message: CreateMessageInput): Promise<MessageModel> {
    const [result] = await this.db
      .insert(messageModel)
      .values(message as typeof messageModel.$inferInsert)
      .returning()

    return result as MessageModel
  }

  async createOrUpdate(
    message: CreateMessageInput,
  ): Promise<CreateMessageResult> {
    const now = message.createdAt ?? new Date()

    const [result] = await this.db
      .insert(messageModel)
      .values({
        ...message,
        createdAt: now,
        updatedAt: now,
      } as typeof messageModel.$inferInsert)
      .onConflictDoUpdate({
        target: [messageModel.contactInboxId, messageModel.sourceId],
        set: {
          updatedAt: new Date(),
        },
      })
      .returning()

    const isNew = result.createdAt.getTime() === now.getTime()
    return { message: result as MessageModel, isNew }
  }

  async createWithAttachments(
    message: CreateMessageInput,
    attachments: Omit<
      CreateAttachmentInput,
      "messageId" | "messageCreatedAt"
    >[],
  ): Promise<MessageWithAttachments> {
    return await this.db.transaction(async (tx) => {
      const [newMessage] = await tx
        .insert(messageModel)
        .values(message as typeof messageModel.$inferInsert)
        .returning()

      let messageAttachments: AttachmentModel[] = []

      if (attachments.length > 0) {
        const attachmentValues = attachments.map((attachment) => ({
          ...attachment,
          messageId: newMessage.id,
        }))
        messageAttachments = (await tx
          .insert(attachmentModel)
          .values(attachmentValues as (typeof attachmentModel.$inferInsert)[])
          .returning()) as AttachmentModel[]
      }

      return {
        ...newMessage,
        attachments: messageAttachments,
      } as MessageWithAttachments
    })
  }

  async createOrUpdateWithAttachments(
    message: CreateMessageInput,
    attachments: Omit<
      CreateAttachmentInput,
      "messageId" | "messageCreatedAt"
    >[],
  ): Promise<{ result: MessageWithAttachments; isNew: boolean }> {
    return await this.db.transaction(async (tx) => {
      const now = message.createdAt ?? new Date()
      const [newMessage] = await tx
        .insert(messageModel)
        .values({
          ...message,
          createdAt: now,
          updatedAt: now,
        } as typeof messageModel.$inferInsert)
        .onConflictDoUpdate({
          target: [messageModel.contactInboxId, messageModel.sourceId],
          set: {
            updatedAt: new Date(),
          },
        })
        .returning()

      const isNew = newMessage.createdAt.getTime() === now.getTime()

      let messageAttachments: AttachmentModel[] = []

      if (isNew && attachments.length > 0) {
        const attachmentValues = attachments.map((attachment) => ({
          ...attachment,
          messageId: newMessage.id,
        }))
        messageAttachments = (await tx
          .insert(attachmentModel)
          .values(attachmentValues as (typeof attachmentModel.$inferInsert)[])
          .returning()) as AttachmentModel[]
      }

      return {
        result: {
          ...newMessage,
          attachments: messageAttachments,
        } as MessageWithAttachments,
        isNew,
      }
    })
  }

  async findById(
    id: string,
    createdAt?: Date,
  ): Promise<MessageWithAttachments | null> {
    const whereConditions = [eq(messageModel.id, id)]
    if (createdAt) {
      whereConditions.push(eq(messageModel.createdAt, createdAt))
    }

    const [message] = await this.db
      .select()
      .from(messageModel)
      .where(and(...whereConditions))
      .limit(1)

    if (!message) {
      return null
    }

    const attachments = await this.queryAttachmentsForMessages([id])

    return {
      ...message,
      attachments,
    } as MessageWithAttachments
  }

  async findBySourceId(
    sourceId: string,
    conversationId: string,
    workspaceId: string,
    sinceTime?: Date,
  ): Promise<MessageModel | null> {
    const whereConditions = [
      eq(messageModel.sourceId, sourceId),
      eq(messageModel.conversationId, conversationId),
      eq(messageModel.workspaceId, workspaceId),
    ]

    if (sinceTime) {
      whereConditions.push(gte(messageModel.createdAt, sinceTime))
    }

    const [message] = await this.db
      .select()
      .from(messageModel)
      .where(and(...whereConditions))
      .limit(1)

    return (message as MessageModel) ?? null
  }

  async findLastByConversation(
    conversationId: string,
    options?: FindLastByConversationOptions,
  ): Promise<MessageWithAttachments[]> {
    const limit = options?.limit ?? 1

    const whereConditions = [eq(messageModel.conversationId, conversationId)]

    if (options?.sinceTime) {
      whereConditions.push(gte(messageModel.createdAt, options.sinceTime))
    }

    if (options?.messageTypes && options.messageTypes.length > 0) {
      whereConditions.push(
        inArray(messageModel.messageType, options.messageTypes),
      )
    }

    const messages = await this.db
      .select()
      .from(messageModel)
      .where(and(...whereConditions))
      .orderBy(desc(messageModel.createdAt))
      .limit(limit)

    if (messages.length === 0) {
      return []
    }

    if (options?.withAttachments) {
      const messageIds = messages.map((m) => m.id)
      const attachments = await this.queryAttachmentsForMessages(messageIds)
      const attachmentsByMessageId =
        this.groupAttachmentsByMessageId(attachments)

      return messages.map((message) => ({
        ...message,
        attachments: attachmentsByMessageId[message.id] ?? [],
      })) as MessageWithAttachments[]
    }

    return messages.map((message) => ({
      ...message,
      attachments: [],
    })) as MessageWithAttachments[]
  }

  async findManyByConversation(
    conversationId: string,
    options: FindManyByConversationOptions,
  ): Promise<MessageModel[]> {
    const whereConditions = [eq(messageModel.conversationId, conversationId)]

    if (options.sinceTime) {
      whereConditions.push(gte(messageModel.createdAt, options.sinceTime))
    }

    if (options.messageTypes && options.messageTypes.length > 0) {
      whereConditions.push(
        inArray(messageModel.messageType, options.messageTypes),
      )
    }

    if (options.textNotNull) {
      whereConditions.push(isNotNull(messageModel.text))
    }

    const messages = await this.db
      .select()
      .from(messageModel)
      .where(and(...whereConditions))
      .orderBy(desc(messageModel.createdAt))
      .limit(options.limit)

    return messages as MessageModel[]
  }

  async findManyByIds(
    ids: string[],
    contactInboxId: string,
    sinceTime?: Date,
  ): Promise<Pick<MessageModel, "id" | "text">[]> {
    if (ids.length === 0) {
      return []
    }

    const whereConditions = [
      eq(messageModel.contactInboxId, contactInboxId),
      inArray(messageModel.id, ids),
    ]

    if (sinceTime) {
      whereConditions.push(gte(messageModel.createdAt, sinceTime))
    }

    const messages = await this.db
      .select({
        id: messageModel.id,
        text: messageModel.text,
      })
      .from(messageModel)
      .where(and(...whereConditions))

    return messages as Pick<MessageModel, "id" | "text">[]
  }

  async listByConversation(
    query: ListMessagesQuery,
  ): Promise<PaginatedMessages> {
    const { workspaceId, conversationId, pagination } = query
    const { limit, cursor } = pagination

    const whereConditions = [eq(messageModel.workspaceId, workspaceId)]

    if (conversationId) {
      whereConditions.push(eq(messageModel.conversationId, conversationId))
    }

    if (cursor) {
      const cursorCondition = or(
        lt(messageModel.createdAt, cursor.createdAt),
        and(
          eq(messageModel.createdAt, cursor.createdAt),
          ...(cursor.id ? [lt(messageModel.id, cursor.id)] : []),
        ),
      )
      if (cursorCondition) {
        whereConditions.push(cursorCondition)
      }
    }

    const messages = await this.db
      .select()
      .from(messageModel)
      .where(and(...whereConditions))
      .limit(limit + 1)
      .orderBy(desc(messageModel.createdAt), desc(messageModel.id))

    const hasMore = messages.length > limit
    const resultMessages = hasMore ? messages.slice(0, limit) : messages

    if (resultMessages.length === 0) {
      return { data: [], nextCursor: null }
    }

    const messageIds = resultMessages.map((m) => m.id)
    const attachments = await this.queryAttachmentsForMessages(messageIds)
    const attachmentsByMessageId = this.groupAttachmentsByMessageId(attachments)

    const messagesWithAttachments: MessageWithAttachments[] =
      resultMessages.map((message) => ({
        ...message,
        attachments: attachmentsByMessageId[message.id] ?? [],
      })) as MessageWithAttachments[]

    let nextCursor: PaginationCursor | null = null
    if (hasMore && resultMessages.length > 0) {
      const lastMessage = resultMessages.at(-1)
      if (lastMessage) {
        nextCursor = {
          createdAt: lastMessage.createdAt,
          id: lastMessage.id,
        }
      }
    }

    return {
      data: messagesWithAttachments,
      nextCursor,
    }
  }

  private async queryAttachmentsForMessages(
    messageIds: string[],
  ): Promise<AttachmentModel[]> {
    if (messageIds.length === 0) {
      return []
    }

    const attachments = await this.db
      .select()
      .from(attachmentModel)
      .where(inArray(attachmentModel.messageId, messageIds))

    return attachments as AttachmentModel[]
  }

  private groupAttachmentsByMessageId(
    attachments: AttachmentModel[],
  ): Record<string, AttachmentModel[]> {
    return attachments.reduce(
      (acc, attachment) => {
        const key = attachment.messageId
        if (!acc[key]) {
          acc[key] = []
        }
        acc[key].push(attachment)
        return acc
      },
      {} as Record<string, AttachmentModel[]>,
    )
  }
}
