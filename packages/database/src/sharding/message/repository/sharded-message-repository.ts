import {
  invalidateCacheByTags,
  distributedLock as redisDistributedLock,
  withCache,
} from "@chatbotx.io/redis"
import { and, desc, eq, gte, inArray, isNotNull, lt, or } from "drizzle-orm"
import { logger } from "../../../logger"
import type {
  CreateAttachmentInput,
  CreateMessageInput,
  CreateMessageResult,
  DistributedLock,
  FindLastByConversationOptions,
  FindManyByConversationOptions,
  IMessageRepository,
  ListMessagesQuery,
  MessageWithAttachments,
  PaginatedMessages,
  PaginationCursor,
} from "../../../repositories/message"
import type { AttachmentModel, MessageModel } from "../../../types"
import {
  endOfHour,
  rehydrateTimeRangeDates,
  startOfHour,
  withShardRetry,
} from "../../shared"
import {
  attachmentModel,
  type MessageShardConnectionManager,
  type MessageShardDatabaseClient,
  type MessageShardTimeRangeInfo,
  messageModel,
} from ".."

export { getSafeSinceTime } from "../../../repositories"

const SHARD_RANGE_CACHE_TAG = "message-shard-range"
const SHARD_RANGE_CACHE_TTL_S = 30

export class ShardedMessageRepository implements IMessageRepository {
  private readonly shardManager: MessageShardConnectionManager
  private readonly distributedLock: DistributedLock

  private static readonly LOCK_TIMEOUT_SECONDS = 30

  constructor(
    shardManager: MessageShardConnectionManager,
    distributedLock?: DistributedLock,
  ) {
    this.shardManager = shardManager
    this.distributedLock = distributedLock ?? redisDistributedLock
  }

  private buildLockKey(conversationId: string, sourceId: string): string {
    return `msg:upsert:${conversationId}:${sourceId}`
  }

  async invalidateShardRangeCache(): Promise<void> {
    await invalidateCacheByTags([SHARD_RANGE_CACHE_TAG])
  }

  private async getShardsForRange(
    start: Date,
    end: Date,
  ): Promise<MessageShardTimeRangeInfo[]> {
    const bucketStart = startOfHour(start)
    const bucketEnd = endOfHour(end)
    const key = `${SHARD_RANGE_CACHE_TAG}:${bucketStart.getTime()}:${bucketEnd.getTime()}`

    const cached = await withCache(
      key,
      () => this.shardManager.getShardsForTimeRange(bucketStart, bucketEnd),
      {
        ttl: SHARD_RANGE_CACHE_TTL_S,
        tags: [SHARD_RANGE_CACHE_TAG],
      },
    )

    return rehydrateTimeRangeDates(cached)
  }

  private executeWithLock<T>(
    lockKey: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    return this.distributedLock.runExclusive({
      key: lockKey,
      timeoutInSeconds: ShardedMessageRepository.LOCK_TIMEOUT_SECONDS,
      fn,
    })
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

  private async fetchAndGroupAttachments(
    shardClient: MessageShardDatabaseClient,
    messages: { id: string; createdAt: Date }[],
  ): Promise<Record<string, AttachmentModel[]>> {
    const messageIds = messages.map((m) => m.id)
    const messageCreatedAts = messages.map((m) => m.createdAt)
    const attachments = await this.queryAttachmentsForMessages(
      shardClient,
      messageIds,
      messageCreatedAts,
    )
    return this.groupAttachmentsByMessageId(attachments)
  }

  private mapMessagesToWithAttachments(
    messages: MessageModel[],
    attachmentsByMessageId: Record<string, AttachmentModel[]>,
  ): MessageWithAttachments[] {
    return messages.map(
      (message) =>
        ({
          ...message,
          attachments: attachmentsByMessageId[message.id] ?? [],
        }) as MessageWithAttachments,
    )
  }

  private async queryAttachmentsForMessages(
    db: MessageShardDatabaseClient,
    messageIds: string[],
    messageCreatedAts?: Date[],
  ): Promise<AttachmentModel[]> {
    if (messageIds.length === 0) {
      return []
    }

    if (messageCreatedAts && messageCreatedAts.length === messageIds.length) {
      const perMessageConditions = messageIds.map((id, i) =>
        and(
          eq(attachmentModel.messageId, id),
          eq(attachmentModel.messageCreatedAt, messageCreatedAts[i]),
        ),
      )
      const attachments = await db
        .select()
        .from(attachmentModel)
        .where(or(...perMessageConditions))
      return attachments as AttachmentModel[]
    }

    const attachments = await db
      .select()
      .from(attachmentModel)
      .where(inArray(attachmentModel.messageId, messageIds))

    return attachments as AttachmentModel[]
  }

  create(message: CreateMessageInput): Promise<MessageModel> {
    return withShardRetry(async () => {
      const db = await this.shardManager.getShardForWrite(message.workspaceId)
      const [result] = await db
        .insert(messageModel)
        .values(message as typeof messageModel.$inferInsert)
        .returning()
      return result as MessageModel
    })
  }

  async createOrUpdate(
    message: CreateMessageInput,
  ): Promise<CreateMessageResult> {
    if (message.sourceId && message.conversationId && message.workspaceId) {
      const lockKey = this.buildLockKey(
        message.conversationId,
        message.sourceId,
      )

      const doCreateOrUpdate = async (): Promise<CreateMessageResult> => {
        const existing = await this.findBySourceId(
          message.sourceId as string,
          message.conversationId,
          message.workspaceId,
          message.createdAt,
        )
        if (existing) {
          return { message: existing, isNew: false }
        }
        const created = await this.create(message)
        return { message: created, isNew: true }
      }

      return this.executeWithLock(lockKey, doCreateOrUpdate)
    }
    const created = await this.create(message)
    return { message: created, isNew: true }
  }

  createWithAttachments(
    message: CreateMessageInput,
    attachments: Omit<
      CreateAttachmentInput,
      "messageId" | "messageCreatedAt"
    >[],
  ): Promise<MessageWithAttachments> {
    return withShardRetry(() =>
      this.createWithAttachmentsInternal(message, attachments),
    )
  }

  private async createWithAttachmentsInternal(
    message: CreateMessageInput,
    attachments: Omit<
      CreateAttachmentInput,
      "messageId" | "messageCreatedAt"
    >[],
  ): Promise<MessageWithAttachments> {
    const db = await this.shardManager.getShardForWrite(message.workspaceId)

    return db.transaction(async (tx) => {
      const [newMessage] = await tx
        .insert(messageModel)
        .values(message as typeof messageModel.$inferInsert)
        .returning()

      let messageAttachments: AttachmentModel[] = []

      if (attachments.length > 0) {
        const attachmentValues = attachments.map((attachment) => ({
          ...attachment,
          messageId: newMessage.id,
          messageCreatedAt: newMessage.createdAt,
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
    if (message.sourceId && message.conversationId && message.workspaceId) {
      const lockKey = this.buildLockKey(
        message.conversationId,
        message.sourceId,
      )

      const doCreateOrUpdate = async (): Promise<{
        result: MessageWithAttachments
        isNew: boolean
      }> => {
        const existing = await this.findBySourceId(
          message.sourceId as string,
          message.conversationId,
          message.workspaceId,
          message.createdAt,
        )
        if (existing) {
          const existingWithAttachments = await this.findById(
            existing.id,
            existing.createdAt,
          )
          return {
            result: existingWithAttachments ?? { ...existing, attachments: [] },
            isNew: false,
          }
        }
        const created = await withShardRetry(() =>
          this.createWithAttachmentsInternal(message, attachments),
        )
        return { result: created, isNew: true }
      }

      return this.executeWithLock(lockKey, doCreateOrUpdate)
    }
    const created = await withShardRetry(() =>
      this.createWithAttachmentsInternal(message, attachments),
    )
    return { result: created, isNew: true }
  }

  async findById(
    id: string,
    createdAt?: Date,
  ): Promise<MessageWithAttachments | null> {
    if (!createdAt) {
      throw new Error(
        "createdAt is required for findById in sharded repository",
      )
    }

    const shards = await this.getShardsForRange(createdAt, createdAt)
    if (shards.length === 0) {
      return null
    }

    for (const shardInfo of shards) {
      try {
        const shardClient = await this.shardManager.getShardClientForRead(
          shardInfo.shard,
        )
        const [message] = await shardClient
          .select()
          .from(messageModel)
          .where(
            and(eq(messageModel.id, id), eq(messageModel.createdAt, createdAt)),
          )
          .limit(1)

        if (message) {
          const attachments = await this.queryAttachmentsForMessages(
            shardClient,
            [id],
            [message.createdAt],
          )
          return { ...message, attachments } as MessageWithAttachments
        }
      } catch (error) {
        logger.warn(
          { err: error, shardId: shardInfo.shard.id },
          "Shard query failed in findById",
        )
      }
    }

    return null
  }

  async findBySourceId(
    sourceId: string,
    conversationId: string,
    workspaceId: string,
    sinceTime?: Date,
  ): Promise<MessageModel | null> {
    if (!sinceTime) {
      throw new Error(
        "sinceTime is required for findBySourceId in sharded repository",
      )
    }

    const shards = await this.getShardsForRange(sinceTime, new Date())
    if (shards.length === 0) {
      return null
    }

    const results = await Promise.all(
      shards.map(async (shardInfo): Promise<MessageModel | null> => {
        try {
          const shardClient = await this.shardManager.getShardClientForRead(
            shardInfo.shard,
          )
          const [message] = await shardClient
            .select()
            .from(messageModel)
            .where(
              and(
                eq(messageModel.sourceId, sourceId),
                eq(messageModel.conversationId, conversationId),
                eq(messageModel.workspaceId, workspaceId),
                gte(messageModel.createdAt, sinceTime),
              ),
            )
            .limit(1)
          return (message as MessageModel) ?? null
        } catch (error) {
          logger.warn(
            { err: error, shardId: shardInfo.shard.id },
            "Shard query failed in findBySourceId",
          )
          return null
        }
      }),
    )

    const matches = results.filter((r): r is MessageModel => r !== null)
    if (matches.length <= 1) {
      return matches[0] ?? null
    }
    return matches.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    )[0]
  }

  async findLastByConversation(
    conversationId: string,
    options?: FindLastByConversationOptions,
  ): Promise<MessageWithAttachments[]> {
    const limit = options?.limit ?? 1
    const sinceTime = options?.sinceTime

    if (!sinceTime) {
      throw new Error(
        "sinceTime is required for findLastByConversation in sharded repository",
      )
    }

    const shards = await this.getShardsForRange(sinceTime, new Date())
    if (shards.length === 0) {
      return []
    }

    // Query all relevant shards in parallel and merge by recency
    const shardResults = await Promise.all(
      shards.map(async (shardInfo): Promise<MessageWithAttachments[]> => {
        try {
          const shardClient = await this.shardManager.getShardClientForRead(
            shardInfo.shard,
          )
          const whereConditions = [
            eq(messageModel.conversationId, conversationId),
            gte(messageModel.createdAt, sinceTime),
          ]

          if (options?.messageTypes && options.messageTypes.length > 0) {
            whereConditions.push(
              inArray(messageModel.messageType, options.messageTypes),
            )
          }

          const messages = await shardClient
            .select()
            .from(messageModel)
            .where(and(...whereConditions))
            .orderBy(desc(messageModel.createdAt))
            .limit(limit)

          if (messages.length === 0) {
            return []
          }

          let attachmentsByMessageId: Record<string, AttachmentModel[]> = {}
          if (options?.withAttachments) {
            attachmentsByMessageId = await this.fetchAndGroupAttachments(
              shardClient,
              messages,
            )
          }

          return this.mapMessagesToWithAttachments(
            messages as MessageModel[],
            attachmentsByMessageId,
          )
        } catch (error) {
          logger.warn(
            { err: error, shardId: shardInfo.shard.id },
            "Shard query failed in findLastByConversation",
          )
          return []
        }
      }),
    )

    return shardResults
      .flat()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
  }

  async findManyByConversation(
    conversationId: string,
    options: FindManyByConversationOptions,
  ): Promise<MessageModel[]> {
    const sinceTime = options.sinceTime

    if (!sinceTime) {
      throw new Error(
        "sinceTime is required for findManyByConversation in sharded repository",
      )
    }

    const shards = await this.getShardsForRange(sinceTime, new Date())
    if (shards.length === 0) {
      return []
    }

    // Query all relevant shards in parallel and merge by recency
    const shardResults = await Promise.all(
      shards.map(async (shardInfo): Promise<MessageModel[]> => {
        try {
          const shardClient = await this.shardManager.getShardClientForRead(
            shardInfo.shard,
          )
          const whereConditions = [
            eq(messageModel.conversationId, conversationId),
            gte(messageModel.createdAt, sinceTime),
          ]

          if (options.messageTypes && options.messageTypes.length > 0) {
            whereConditions.push(
              inArray(messageModel.messageType, options.messageTypes),
            )
          }

          if (options.textNotNull) {
            whereConditions.push(isNotNull(messageModel.text))
          }

          const messages = await shardClient
            .select()
            .from(messageModel)
            .where(and(...whereConditions))
            .orderBy(desc(messageModel.createdAt))
            .limit(options.limit)

          return messages as MessageModel[]
        } catch (error) {
          logger.warn(
            { err: error, shardId: shardInfo.shard.id },
            "Shard query failed in findManyByConversation",
          )
          return []
        }
      }),
    )

    return shardResults
      .flat()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, options.limit)
  }

  async findManyByIds(
    ids: string[],
    contactInboxId: string,
    sinceTime?: Date,
  ): Promise<Pick<MessageModel, "id" | "text">[]> {
    if (ids.length === 0) {
      return []
    }

    if (!sinceTime) {
      throw new Error(
        "sinceTime is required for findManyByIds in sharded repository",
      )
    }

    const shards = await this.getShardsForRange(sinceTime, new Date())
    if (shards.length === 0) {
      return []
    }

    // Query all shards in parallel and deduplicate
    const shardResults = await Promise.all(
      shards.map(
        async (shardInfo): Promise<Pick<MessageModel, "id" | "text">[]> => {
          try {
            const shardClient = await this.shardManager.getShardClientForRead(
              shardInfo.shard,
            )
            const messages = await shardClient
              .select({ id: messageModel.id, text: messageModel.text })
              .from(messageModel)
              .where(
                and(
                  eq(messageModel.contactInboxId, contactInboxId),
                  inArray(messageModel.id, ids),
                  gte(messageModel.createdAt, sinceTime),
                ),
              )
            return messages as Pick<MessageModel, "id" | "text">[]
          } catch (error) {
            logger.warn(
              { err: error, shardId: shardInfo.shard.id },
              "Shard query failed in findManyByIds",
            )
            return []
          }
        },
      ),
    )

    const seen = new Set<string>()
    return shardResults.flat().filter((m) => {
      if (seen.has(m.id)) {
        return false
      }
      seen.add(m.id)
      return true
    })
  }

  async listByConversation(
    query: ListMessagesQuery,
  ): Promise<PaginatedMessages> {
    const { pagination, sinceTime } = query
    const { limit, cursor } = pagination

    const endTime = cursor?.createdAt ?? new Date()
    const startTime = sinceTime ?? new Date(0)
    const allShards = await this.getShardsForRange(startTime, endTime)

    if (allShards.length === 0) {
      return { data: [], nextCursor: null }
    }

    const descShards = [...allShards].reverse()

    let shards = descShards
    if (cursor?.shardId) {
      const idx = descShards.findIndex((s) => s.shard.id === cursor.shardId)
      if (idx >= 0) {
        shards = descShards.slice(idx)
      }
    }

    const data: MessageWithAttachments[] = []
    let nextCursor: PaginationCursor | null = null
    let cursorForQuery = cursor
    let hasPartialResults = false
    let lastProductiveShardId: string | undefined

    for (const shard of shards) {
      const remaining = limit - data.length
      if (remaining <= 0) {
        const last = data.at(-1)
        if (last) {
          nextCursor = {
            createdAt: last.createdAt,
            id: last.id,
            shardId: lastProductiveShardId,
          }
        }
        break
      }

      try {
        const result = await this.queryShardForMessages(
          shard,
          query,
          remaining,
          cursorForQuery,
        )

        if (result.data.length > 0) {
          lastProductiveShardId = shard.shard.id
          const lastMsg = result.data.at(-1)
          if (lastMsg) {
            cursorForQuery = {
              createdAt: lastMsg.createdAt,
              id: lastMsg.id,
            }
          }
        } else {
          cursorForQuery = undefined
        }

        data.push(...result.data)

        if (result.nextCursor) {
          nextCursor = result.nextCursor
          break
        }
      } catch (error) {
        hasPartialResults = true
        cursorForQuery = undefined
        logger.warn(
          { err: error, shardId: shard.shard.id },
          "Shard query failed in listByConversation",
        )
      }
    }

    return {
      data,
      nextCursor,
      ...(hasPartialResults && { hasPartialResults: true }),
    }
  }

  private buildNextCursor(
    lastMessage: typeof messageModel.$inferSelect,
    shardId?: string,
  ): PaginationCursor {
    return {
      createdAt: lastMessage.createdAt,
      id: lastMessage.id,
      shardId,
    }
  }

  private async queryShardForMessages(
    shardInfo: MessageShardTimeRangeInfo,
    query: ListMessagesQuery,
    limit: number,
    cursor?: PaginationCursor,
  ): Promise<PaginatedMessages> {
    const { workspaceId, conversationId } = query
    const shardClient = await this.shardManager.getShardClientForRead(
      shardInfo.shard,
    )

    const whereConditions = [eq(messageModel.workspaceId, workspaceId)]

    if (conversationId) {
      whereConditions.push(eq(messageModel.conversationId, conversationId))
    }

    if (cursor) {
      const cursorCondition = cursor.id
        ? or(
            lt(messageModel.createdAt, cursor.createdAt),
            and(
              eq(messageModel.createdAt, cursor.createdAt),
              lt(messageModel.id, cursor.id),
            ),
          )
        : lt(messageModel.createdAt, cursor.createdAt)
      if (cursorCondition) {
        whereConditions.push(cursorCondition)
      }
    }

    const messages = await shardClient
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

    const attachmentsByMessageId = await this.fetchAndGroupAttachments(
      shardClient,
      resultMessages,
    )

    const messagesWithAttachments = this.mapMessagesToWithAttachments(
      resultMessages as MessageModel[],
      attachmentsByMessageId,
    )

    let nextCursor: PaginationCursor | null = null
    if (hasMore) {
      const lastMessage = resultMessages.at(-1)
      if (lastMessage) {
        nextCursor = this.buildNextCursor(lastMessage, shardInfo.shard.id)
      }
    }

    return { data: messagesWithAttachments, nextCursor }
  }
}
