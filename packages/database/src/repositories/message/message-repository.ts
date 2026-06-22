import {
  and,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm"

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
  workspaceId?: string
}

export interface FindManyByConversationOptions {
  limit: number
  messageTypes?: ("incoming" | "outgoing" | "activity")[]
  requireCompleteResults?: boolean
  sinceTime?: Date
  textNotNull?: boolean
  workspaceId?: string
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

  /** Soft-deletes a single message by its primary key. */
  deleteById(
    id: string,
    workspaceId: string,
    createdAt?: Date,
  ): Promise<{ id: string }[]>

  /**
   * Soft-deletes a comment (`sourceId = commentId`) and all its child comments
   * (`contentAttributes.parentId = commentId`) by setting `deletedAt = NOW()`.
   * The rows stay in the DB; the inbox renders them dimmed/disabled. Returns
   * the affected message ids. Scoped by `workspaceId` since child comments may
   * live in other conversations.
   */
  deleteBySourceId(
    commentId: string,
    workspaceId: string,
    createdAt: Date,
  ): Promise<{ id: string }[]>

  findAIContextMessages(
    options: FindAIContextMessagesOptions,
  ): Promise<MessageModel[]>

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
    workspaceId?: string,
  ): Promise<Pick<MessageModel, "id" | "text">[]>

  findTriggerMessage(
    options: FindTriggerMessageOptions,
  ): Promise<MessageWithAttachments | null>

  listByConversation(query: ListMessagesQuery): Promise<PaginatedMessages>

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

  /** Updates the text of the message identified by sourceId (e.g. a Facebook
   *  comment ID). Used when an external edit arrives via webhook and the DB
   *  message ID is not known. */
  updateTextBySourceId(
    sourceId: string,
    workspaceId: string,
    newText: string,
  ): Promise<{ id: string } | null>
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

  async deleteBySourceId(
    sourceId: string,
    workspaceId: string,
    _createdAt: Date,
  ): Promise<{ id: string }[]> {
    // Single atomic CTE: find the parent by sourceId, then soft-delete
    // the parent and all its child comments in one statement.
    const result = await this.db.execute<{ id: string }>(sql`
      WITH parent AS (
        SELECT id FROM "Message"
        WHERE "workspaceId" = ${workspaceId} AND "sourceId" = ${sourceId}
        LIMIT 1
      )
      UPDATE "Message" SET "deletedAt" = NOW()
      WHERE "workspaceId" = ${workspaceId}
        AND (
          "sourceId" = ${sourceId}
          OR "parentId" = (SELECT id::text FROM parent)
        )
      RETURNING id
    `)
    return result.rows as { id: string }[]
  }

  async deleteById(
    id: string,
    workspaceId: string,
    _createdAt?: Date,
  ): Promise<{ id: string }[]> {
    const rows = await this.db
      .update(messageModel)
      .set({ deletedAt: new Date() })
      .where(
        and(eq(messageModel.workspaceId, workspaceId), eq(messageModel.id, id)),
      )
      .returning({ id: messageModel.id })

    return rows as { id: string }[]
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
    createdAt: Date,
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

  async findAIContextMessages(
    options: FindAIContextMessagesOptions,
  ): Promise<MessageModel[]> {
    const baseConditions = [
      eq(messageModel.conversationId, options.conversationId),
      eq(messageModel.workspaceId, options.workspaceId),
    ]
    if (options.sinceTime) {
      baseConditions.push(gte(messageModel.createdAt, options.sinceTime))
    }
    if (options.messageTypes && options.messageTypes.length > 0) {
      baseConditions.push(
        inArray(messageModel.messageType, options.messageTypes),
      )
    }
    if (options.textNotNull) {
      baseConditions.push(isNotNull(messageModel.text))
    }

    const latestMessages = async () => {
      const messages = await this.db
        .select()
        .from(messageModel)
        .where(and(...baseConditions))
        .orderBy(desc(messageModel.createdAt), desc(messageModel.id))
        .limit(options.limit)

      return [...messages].reverse() as MessageModel[]
    }

    if (!options.markerMessageId) {
      return latestMessages()
    }

    const [marker] = await this.db
      .select({
        createdAt: messageModel.createdAt,
        id: messageModel.id,
      })
      .from(messageModel)
      .where(
        and(
          eq(messageModel.id, options.markerMessageId),
          eq(messageModel.conversationId, options.conversationId),
          eq(messageModel.workspaceId, options.workspaceId),
        ),
      )
      .limit(1)

    if (!marker) {
      return latestMessages()
    }

    const messages = await this.db
      .select()
      .from(messageModel)
      .where(
        and(
          ...baseConditions,
          or(
            gt(messageModel.createdAt, marker.createdAt),
            and(
              eq(messageModel.createdAt, marker.createdAt),
              gt(messageModel.id, marker.id),
            ),
          ),
        ),
      )
      .orderBy(desc(messageModel.createdAt), desc(messageModel.id))
      .limit(options.limit)

    return [...messages].reverse() as MessageModel[]
  }

  async findTriggerMessage(
    options: FindTriggerMessageOptions,
  ): Promise<MessageWithAttachments | null> {
    const [message] = await this.db
      .select()
      .from(messageModel)
      .where(
        and(
          eq(messageModel.id, options.id),
          eq(messageModel.conversationId, options.conversationId),
          eq(messageModel.workspaceId, options.workspaceId),
          gte(messageModel.createdAt, options.sinceTime),
        ),
      )
      .limit(1)

    if (!message) {
      return null
    }

    const attachments = await this.queryAttachmentsForMessages([message.id])
    return { ...message, attachments } as MessageWithAttachments
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
      .orderBy(desc(messageModel.createdAt), desc(messageModel.id))
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
      .orderBy(desc(messageModel.createdAt), desc(messageModel.id))
      .limit(options.limit)

    return messages as MessageModel[]
  }

  async findManyByIds(
    ids: string[],
    contactInboxId: string,
    sinceTime?: Date,
    _workspaceId?: string,
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

    const whereConditions = [
      eq(messageModel.workspaceId, workspaceId),
      isNull(messageModel.deletedAt),
    ]

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

  async bulkCreate(
    messages: CreateMessageInput[],
  ): Promise<{ id: string; sourceId: string | null }[]> {
    if (messages.length === 0) {
      return []
    }

    const CHUNK_SIZE = 1000
    const inserted: { id: string; sourceId: string | null }[] = []

    for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
      const chunk = messages.slice(i, i + CHUNK_SIZE)
      const rows = await this.db
        .insert(messageModel)
        .values(chunk as (typeof messageModel.$inferInsert)[])
        .onConflictDoNothing({
          target: [messageModel.contactInboxId, messageModel.sourceId],
        })
        .returning({
          id: messageModel.id,
          sourceId: messageModel.sourceId,
        })
      for (const row of rows) {
        inserted.push({ id: row.id, sourceId: row.sourceId })
      }
    }

    return inserted
  }

  async bulkCreateAttachments(
    attachments: BulkCreateAttachmentInput[],
  ): Promise<{ id: string }[]> {
    if (attachments.length === 0) {
      return []
    }
    return await this.db
      .insert(attachmentModel)
      .values(
        attachments.map((a) => ({
          id: a.id,
          workspaceId: a.workspaceId,
          conversationId: a.conversationId,
          fileType:
            a.fileType as (typeof attachmentModel.$inferInsert)["fileType"],
          messageId: a.messageId,
          sourceId: a.sourceId,
          mimeType: a.mimeType,
          width: a.width,
          height: a.height,
          size: a.size,
          thumbnailPath: a.thumbnailPath,
          originPath: a.originPath,
          name: a.name,
        })),
      )
      .returning({ id: attachmentModel.id })
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

  async deleteAttachmentsByMessageId(
    messageId: string,
    workspaceId: string,
    _createdAt: Date,
  ): Promise<void> {
    await this.db
      .delete(attachmentModel)
      .where(
        and(
          eq(attachmentModel.messageId, messageId),
          eq(attachmentModel.workspaceId, workspaceId),
        ),
      )
  }

  private async updateMessageFields(
    messageId: string,
    workspaceId: string,
    patch: Partial<typeof messageModel.$inferInsert>,
  ): Promise<{ id: string } | null> {
    const [row] = await this.db
      .update(messageModel)
      .set(patch)
      .where(
        and(
          eq(messageModel.id, messageId),
          eq(messageModel.workspaceId, workspaceId),
        ),
      )
      .returning({ id: messageModel.id })
    return (row as { id: string } | undefined) ?? null
  }

  updateMessageAttributes(
    messageId: string,
    workspaceId: string,
    attributes: { liked: boolean; hidden: boolean },
    _createdAt: Date,
  ): Promise<{ id: string } | null> {
    return this.updateMessageFields(messageId, workspaceId, { attributes })
  }

  updateMessageText(
    messageId: string,
    workspaceId: string,
    newText: string,
    _createdAt: Date,
  ): Promise<{ id: string } | null> {
    return this.updateMessageFields(messageId, workspaceId, { text: newText })
  }

  async updateTextBySourceId(
    sourceId: string,
    workspaceId: string,
    newText: string,
  ): Promise<{ id: string } | null> {
    const [row] = await this.db
      .update(messageModel)
      .set({ text: newText })
      .where(
        and(
          eq(messageModel.sourceId, sourceId),
          eq(messageModel.workspaceId, workspaceId),
        ),
      )
      .returning({ id: messageModel.id })
    return (row as { id: string } | undefined) ?? null
  }

  async updateSourceId(
    id: string,
    sourceId: string,
    _workspaceId: string,
  ): Promise<void> {
    await this.db
      .update(messageModel)
      .set({ sourceId })
      .where(eq(messageModel.id, id))
  }
}
