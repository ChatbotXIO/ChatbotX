import { and, desc, eq, gte, inArray, isNotNull, lt, or } from "drizzle-orm"
import type { DatabaseClient } from "../../client"
import type { attachmentModel, messageModel } from "../../schema"
import type {
  ShardDatabaseClient,
  attachmentModel as shardAttachmentModel,
  messageModel as shardMessageModel,
} from "../../shard"
import type { AttachmentModel, MessageModel } from "../../types"
import type {
  CreateAttachmentInput,
  CreateMessageInput,
  CreateMessageResult,
  FindLastByConversationOptions,
  FindManyByConversationOptions,
  ListMessagesQuery,
  MessageRepository,
  MessageWithAttachments,
  PaginatedMessages,
  PaginationCursor,
} from "./message-repository.interface"

export type MessageTable = typeof messageModel | typeof shardMessageModel
export type AttachmentTable =
  | typeof attachmentModel
  | typeof shardAttachmentModel

export type AnyDatabaseClient = DatabaseClient | ShardDatabaseClient

export abstract class BaseMessageRepository implements MessageRepository {
  protected abstract getMessageModel(): MessageTable
  protected abstract getAttachmentModel(): AttachmentTable

  protected abstract getDbForWrite():
    | AnyDatabaseClient
    | Promise<AnyDatabaseClient>

  protected abstract getDbForRead(
    startTime?: Date,
    endTime?: Date,
  ): AnyDatabaseClient | Promise<AnyDatabaseClient>

  protected abstract createAttachmentValues(
    attachments: Omit<
      CreateAttachmentInput,
      "messageId" | "messageCreatedAt"
    >[],
    messageId: string,
    messageCreatedAt: Date,
  ): (
    | typeof attachmentModel.$inferInsert
    | typeof shardAttachmentModel.$inferInsert
  )[]

  protected abstract queryAttachmentsForMessages(
    db: AnyDatabaseClient,
    messageIds: string[],
    messageCreatedAts?: Date[],
  ): Promise<AttachmentModel[]>

  protected groupAttachmentsByMessageId(
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

  protected buildCursorCondition(
    model: MessageTable,
    cursor: PaginationCursor,
  ) {
    return or(
      lt(model.createdAt, cursor.createdAt),
      and(eq(model.createdAt, cursor.createdAt), lt(model.id, cursor.id)),
    )
  }

  async create(message: CreateMessageInput): Promise<MessageModel> {
    const db = await this.getDbForWrite()
    const model = this.getMessageModel()

    const [result] = await db
      .insert(model)
      .values(message as typeof model.$inferInsert)
      .returning()

    return result as MessageModel
  }

  async createOrUpdate(
    message: CreateMessageInput,
  ): Promise<CreateMessageResult> {
    const db = await this.getDbForWrite()
    const model = this.getMessageModel()
    const now = message.createdAt ?? new Date()

    const [result] = await db
      .insert(model)
      .values({
        ...message,
        createdAt: now,
        updatedAt: now,
      } as typeof model.$inferInsert)
      .onConflictDoUpdate({
        target: [model.contactInboxId, model.sourceId],
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
    const db = await this.getDbForWrite()
    const msgModel = this.getMessageModel()
    const attModel = this.getAttachmentModel()

    return await db.transaction(async (tx) => {
      const [newMessage] = await tx
        .insert(msgModel)
        .values(message as typeof msgModel.$inferInsert)
        .returning()

      let messageAttachments: AttachmentModel[] = []

      if (attachments.length > 0) {
        const attachmentValues = this.createAttachmentValues(
          attachments,
          newMessage.id,
          newMessage.createdAt,
        )
        messageAttachments = (await tx
          .insert(attModel)
          .values(attachmentValues as (typeof attModel.$inferInsert)[])
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
    const db = await this.getDbForWrite()
    const msgModel = this.getMessageModel()
    const attModel = this.getAttachmentModel()

    return await db.transaction(async (tx) => {
      const now = message.createdAt ?? new Date()
      const [newMessage] = await tx
        .insert(msgModel)
        .values({
          ...message,
          createdAt: now,
          updatedAt: now,
        } as typeof msgModel.$inferInsert)
        .onConflictDoUpdate({
          target: [msgModel.contactInboxId, msgModel.sourceId],
          set: {
            updatedAt: new Date(),
          },
        })
        .returning()

      const isNew = newMessage.createdAt.getTime() === now.getTime()

      let messageAttachments: AttachmentModel[] = []

      if (isNew && attachments.length > 0) {
        const attachmentValues = this.createAttachmentValues(
          attachments,
          newMessage.id,
          newMessage.createdAt,
        )
        messageAttachments = (await tx
          .insert(attModel)
          .values(attachmentValues as (typeof attModel.$inferInsert)[])
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
    const db = await this.getDbForRead(createdAt)
    const model = this.getMessageModel()

    const whereConditions = [eq(model.id, id)]
    if (createdAt) {
      whereConditions.push(eq(model.createdAt, createdAt))
    }

    const [message] = await db
      .select()
      .from(model)
      .where(and(...whereConditions))
      .limit(1)

    if (!message) {
      return null
    }

    const attachments = await this.queryAttachmentsForMessages(
      db,
      [id],
      createdAt ? [createdAt] : [message.createdAt],
    )

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
    const startTime =
      sinceTime ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const db = await this.getDbForRead(startTime)
    const model = this.getMessageModel()

    const whereConditions = [
      eq(model.sourceId, sourceId),
      eq(model.conversationId, conversationId),
      eq(model.workspaceId, workspaceId),
    ]

    if (sinceTime) {
      whereConditions.push(gte(model.createdAt, sinceTime))
    }

    const [message] = await db
      .select()
      .from(model)
      .where(and(...whereConditions))
      .limit(1)

    return (message as MessageModel) ?? null
  }

  async findLastByConversation(
    conversationId: string,
    options?: FindLastByConversationOptions,
  ): Promise<MessageWithAttachments[]> {
    const limit = options?.limit ?? 1
    const startTime =
      options?.sinceTime ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const db = await this.getDbForRead(startTime)
    const model = this.getMessageModel()

    const whereConditions = [eq(model.conversationId, conversationId)]

    if (options?.sinceTime) {
      whereConditions.push(gte(model.createdAt, options.sinceTime))
    }

    if (options?.messageTypes && options.messageTypes.length > 0) {
      whereConditions.push(inArray(model.messageType, options.messageTypes))
    }

    const messages = await db
      .select()
      .from(model)
      .where(and(...whereConditions))
      .orderBy(desc(model.createdAt))
      .limit(limit)

    if (messages.length === 0) {
      return []
    }

    if (options?.withAttachments) {
      const messageIds = messages.map((m) => m.id)
      const messageCreatedAts = messages.map((m) => m.createdAt)
      const attachments = await this.queryAttachmentsForMessages(
        db,
        messageIds,
        messageCreatedAts,
      )

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
    const startTime =
      options.sinceTime ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const db = await this.getDbForRead(startTime)
    const model = this.getMessageModel()

    const whereConditions = [eq(model.conversationId, conversationId)]

    if (options.sinceTime) {
      whereConditions.push(gte(model.createdAt, options.sinceTime))
    }

    if (options.messageTypes && options.messageTypes.length > 0) {
      whereConditions.push(inArray(model.messageType, options.messageTypes))
    }

    if (options.textNotNull) {
      whereConditions.push(isNotNull(model.text))
    }

    const messages = await db
      .select()
      .from(model)
      .where(and(...whereConditions))
      .orderBy(desc(model.createdAt))
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

    const startTime =
      sinceTime ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const db = await this.getDbForRead(startTime)
    const model = this.getMessageModel()

    const whereConditions = [
      eq(model.contactInboxId, contactInboxId),
      inArray(model.id, ids),
    ]

    if (sinceTime) {
      whereConditions.push(gte(model.createdAt, sinceTime))
    }

    const messages = await db
      .select({
        id: model.id,
        text: model.text,
      })
      .from(model)
      .where(and(...whereConditions))

    return messages as Pick<MessageModel, "id" | "text">[]
  }

  async listByConversation(
    query: ListMessagesQuery,
  ): Promise<PaginatedMessages> {
    const { workspaceId, conversationId, pagination } = query
    const { limit, cursor } = pagination

    const endTime = cursor?.createdAt ?? new Date()
    const db = await this.getDbForRead(new Date(0), endTime)
    const model = this.getMessageModel()

    const whereConditions = [eq(model.workspaceId, workspaceId)]

    if (conversationId) {
      whereConditions.push(eq(model.conversationId, conversationId))
    }

    if (cursor) {
      const cursorCondition = this.buildCursorCondition(model, cursor)
      if (cursorCondition) {
        whereConditions.push(cursorCondition)
      }
    }

    const messages = await db
      .select()
      .from(model)
      .where(and(...whereConditions))
      .limit(limit + 1)
      .orderBy(desc(model.createdAt), desc(model.id))

    const hasMore = messages.length > limit
    const resultMessages = hasMore ? messages.slice(0, limit) : messages

    if (resultMessages.length === 0) {
      return { data: [], nextCursor: null }
    }

    const messageIds = resultMessages.map((m) => m.id)
    const messageCreatedAts = resultMessages.map((m) => m.createdAt)
    const attachments = await this.queryAttachmentsForMessages(
      db,
      messageIds,
      messageCreatedAts,
    )

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
        nextCursor = this.buildNextCursor(lastMessage)
      }
    }

    return {
      data: messagesWithAttachments,
      nextCursor,
    }
  }

  protected buildNextCursor(
    lastMessage:
      | typeof messageModel.$inferSelect
      | typeof shardMessageModel.$inferSelect,
  ): PaginationCursor {
    return {
      createdAt: lastMessage.createdAt,
      id: lastMessage.id,
    }
  }
}
