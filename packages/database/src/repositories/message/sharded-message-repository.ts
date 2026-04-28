import {
  invalidateCacheByTags,
  distributedLock as redisDistributedLock,
  withCache,
} from "@chatbotx.io/redis"
import { and, desc, eq, gte, inArray, isNotNull, lt, or } from "drizzle-orm"
import { logger } from "../../logger"
import {
  attachmentModel,
  messageModel,
  type ShardConnectionManager,
  type ShardDatabaseClient,
  type ShardTimeRangeInfo,
  withShardRetry,
} from "../../shard"
import type { AttachmentModel, MessageModel } from "../../types"
import {
  type AnyDatabaseClient,
  type AttachmentTable,
  BaseMessageRepository,
  type MessageTable,
} from "./base-message-repository"
import type {
  CreateAttachmentInput,
  CreateMessageInput,
  CreateMessageResult,
  DistributedLock,
  FindLastByConversationOptions,
  FindManyByConversationOptions,
  ListMessagesQuery,
  MessageWithAttachments,
  PaginatedMessages,
  PaginationCursor,
} from "./message-repository.interface"

const SINCE_TIME_BUFFER_MS = 10_000
const SHARD_RANGE_CACHE_TAG = "message-shard-range"
const SHARD_RANGE_CACHE_TTL_S = 5 * 60

export function getSafeSinceTime(
  time: Date | number | undefined | null,
  bufferMs: number = SINCE_TIME_BUFFER_MS,
): Date | undefined {
  if (!time) {
    return
  }

  const timestamp = time instanceof Date ? time.getTime() : time
  const date = new Date(timestamp - bufferMs)
  date.setMinutes(0, 0, 0)
  return date
}

function startOfHour(date: Date): Date {
  const result = new Date(date)
  result.setMinutes(0, 0, 0)
  return result
}

function endOfHour(date: Date): Date {
  const result = new Date(date)
  result.setMinutes(59, 59, 999)
  return result
}

function rehydrateShardTimeRange(
  shards: ShardTimeRangeInfo[],
): ShardTimeRangeInfo[] {
  return shards.map((s) => ({
    ...s,
    startTime: new Date(s.startTime),
    endTime: s.endTime ? new Date(s.endTime) : null,
  }))
}

export class ShardedMessageRepository extends BaseMessageRepository {
  private readonly shardManager: ShardConnectionManager
  private readonly distributedLock: DistributedLock

  private static readonly LOCK_TIMEOUT_SECONDS = 5

  constructor(
    shardManager: ShardConnectionManager,
    distributedLock?: DistributedLock,
  ) {
    super()
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
  ): Promise<ShardTimeRangeInfo[]> {
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

    return rehydrateShardTimeRange(cached)
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

  private async fetchAndGroupAttachments(
    shardClient: ShardDatabaseClient,
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

  protected getMessageModel(): MessageTable {
    return messageModel
  }

  protected getAttachmentModel(): AttachmentTable {
    return attachmentModel
  }

  protected getDbForWrite(): Promise<ShardDatabaseClient> {
    return this.shardManager.getActiveShardForWrite()
  }

  protected async getDbForRead(
    startTime?: Date,
    endTime?: Date,
  ): Promise<ShardDatabaseClient> {
    if (!startTime) {
      throw new Error(
        "startTime is required for getDbForRead in sharded repository",
      )
    }

    const shards = await this.getShardsForRange(
      startTime,
      endTime ?? new Date(),
    )

    if (shards.length === 0) {
      return this.shardManager.getActiveShardForWrite()
    }
    if (shards.length > 1) {
      throw new Error(
        `getDbForRead spans ${shards.length} shards. Use explicit multi-shard query methods instead.`,
      )
    }
    return this.shardManager.getShardClient(shards[0].shard)
  }

  protected createAttachmentValues(
    attachments: Omit<
      CreateAttachmentInput,
      "messageId" | "messageCreatedAt"
    >[],
    messageId: string,
    messageCreatedAt: Date,
  ): (typeof attachmentModel.$inferInsert)[] {
    return attachments.map((attachment) => ({
      ...attachment,
      messageId,
      messageCreatedAt,
    }))
  }

  protected async queryAttachmentsForMessages(
    db: AnyDatabaseClient,
    messageIds: string[],
    messageCreatedAts?: Date[],
  ): Promise<AttachmentModel[]> {
    if (messageIds.length === 0) {
      return []
    }

    const whereConditions = [inArray(attachmentModel.messageId, messageIds)]

    if (messageCreatedAts && messageCreatedAts.length > 0) {
      whereConditions.push(
        inArray(attachmentModel.messageCreatedAt, messageCreatedAts),
      )
    }

    const attachments = await db
      .select()
      .from(attachmentModel)
      .where(and(...whereConditions))

    return attachments as AttachmentModel[]
  }

  override create(message: CreateMessageInput): Promise<MessageModel> {
    return withShardRetry(() => super.create(message))
  }

  override async createOrUpdate(
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
        const created = await withShardRetry(() => super.create(message))
        return { message: created, isNew: true }
      }

      return this.executeWithLock(lockKey, doCreateOrUpdate)
    }
    const created = await withShardRetry(() => super.create(message))
    return { message: created, isNew: true }
  }

  override createWithAttachments(
    message: CreateMessageInput,
    attachments: Omit<
      CreateAttachmentInput,
      "messageId" | "messageCreatedAt"
    >[],
  ): Promise<MessageWithAttachments> {
    return withShardRetry(() =>
      super.createWithAttachments(message, attachments),
    )
  }

  override async createOrUpdateWithAttachments(
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
          super.createWithAttachments(message, attachments),
        )
        return { result: created, isNew: true }
      }

      return this.executeWithLock(lockKey, doCreateOrUpdate)
    }
    const created = await withShardRetry(() =>
      super.createWithAttachments(message, attachments),
    )
    return { result: created, isNew: true }
  }

  override async findById(
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
        const shardClient = await this.shardManager.getShardClient(
          shardInfo.shard,
        )

        const whereConditions = [
          eq(messageModel.id, id),
          eq(messageModel.createdAt, createdAt),
        ]

        const [message] = await shardClient
          .select()
          .from(messageModel)
          .where(and(...whereConditions))
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
          { error, shardId: shardInfo.shard.id },
          "Shard query failed in findById",
        )
      }
    }

    return null
  }

  override async findBySourceId(
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

    for (const shardInfo of shards) {
      try {
        const shardClient = await this.shardManager.getShardClient(
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

        if (message) {
          return message as MessageModel
        }
      } catch (error) {
        logger.warn(
          { error, shardId: shardInfo.shard.id },
          "Shard query failed in findBySourceId",
        )
      }
    }

    return null
  }

  override async findLastByConversation(
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

    const allMessages: MessageWithAttachments[] = []

    for (const shardInfo of shards) {
      if (allMessages.length >= limit) {
        break
      }

      try {
        const shardClient = await this.shardManager.getShardClient(
          shardInfo.shard,
        )
        const whereConditions = [
          eq(messageModel.conversationId, conversationId),
          gte(messageModel.createdAt, sinceTime),
        ]

        if (options?.messageTypes && options.messageTypes.length > 0) {
          // whereConditions.push(
          //   inArray(messageModel.messageType, options.messageTypes),
          // )
        }

        const messages = await shardClient
          .select()
          .from(messageModel)
          .where(and(...whereConditions))
          .orderBy(desc(messageModel.createdAt))
          .limit(limit - allMessages.length)

        if (messages.length === 0) {
          continue
        }

        let attachmentsByMessageId: Record<string, AttachmentModel[]> = {}
        if (options?.withAttachments) {
          attachmentsByMessageId = await this.fetchAndGroupAttachments(
            shardClient,
            messages,
          )
        }

        const messagesWithAttachments = this.mapMessagesToWithAttachments(
          messages as MessageModel[],
          attachmentsByMessageId,
        )
        allMessages.push(...messagesWithAttachments)
      } catch (error) {
        logger.warn(
          { error, shardId: shardInfo.shard.id },
          "Shard query failed in findLastByConversation",
        )
      }
    }

    return allMessages.slice(0, limit)
  }

  override async findManyByConversation(
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

    const allMessages: MessageModel[] = []

    for (const shardInfo of shards) {
      if (allMessages.length >= options.limit) {
        break
      }
      try {
        const shardClient = await this.shardManager.getShardClient(
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
          .limit(options.limit - allMessages.length)

        allMessages.push(...(messages as MessageModel[]))
      } catch (error) {
        logger.warn(
          { error, shardId: shardInfo.shard.id },
          "Shard query failed in findManyByConversation",
        )
      }
    }

    return allMessages.slice(0, options.limit)
  }

  override async findManyByIds(
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

    const allMessages: Pick<MessageModel, "id" | "text">[] = []
    const foundIds = new Set<string>()

    for (const shardInfo of shards) {
      if (foundIds.size === ids.length) {
        break
      }
      try {
        const shardClient = await this.shardManager.getShardClient(
          shardInfo.shard,
        )

        const remainingIds = ids.filter((id) => !foundIds.has(id))

        const messages = await shardClient
          .select({
            id: messageModel.id,
            text: messageModel.text,
          })
          .from(messageModel)
          .where(
            and(
              eq(messageModel.contactInboxId, contactInboxId),
              inArray(messageModel.id, remainingIds),
              gte(messageModel.createdAt, sinceTime),
            ),
          )

        for (const message of messages) {
          if (!foundIds.has(message.id)) {
            foundIds.add(message.id)
            allMessages.push(message)
          }
        }
      } catch (error) {
        logger.warn(
          { error, shardId: shardInfo.shard.id },
          "Shard query failed in findManyByIds",
        )
      }
    }

    return allMessages
  }

  override async listByConversation(
    query: ListMessagesQuery,
  ): Promise<PaginatedMessages> {
    const { pagination } = query
    const { limit, cursor } = pagination

    const endTime = cursor?.createdAt ?? new Date()
    const allShards = await this.getShardsForRange(new Date(0), endTime)

    if (allShards.length === 0) {
      return { data: [], nextCursor: null }
    }

    let shards = allShards
    if (cursor?.shardId) {
      const idx = allShards.findIndex((s) => s.shard.id === cursor.shardId)
      if (idx >= 0) {
        shards = allShards.slice(idx)
      }
    }

    const data: MessageWithAttachments[] = []
    let nextCursor: PaginationCursor | null = null
    let cursorForQuery = cursor
    let hasPartialResults = false

    for (const shard of shards) {
      const remaining = limit - data.length
      if (remaining <= 0) {
        const last = data.at(-1)
        if (last) {
          nextCursor = {
            createdAt: last.createdAt,
            id: last.id,
            shardId: shard.shard.id,
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
        cursorForQuery = undefined
        data.push(...result.data)

        if (result.nextCursor) {
          nextCursor = result.nextCursor
          break
        }
      } catch (error) {
        hasPartialResults = true
        logger.warn(
          { error, shardId: shard.shard.id },
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

  protected override buildNextCursor(
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
    shardInfo: ShardTimeRangeInfo,
    query: ListMessagesQuery,
    limit: number,
    cursor?: PaginationCursor,
  ): Promise<PaginatedMessages> {
    const { workspaceId, conversationId } = query
    const shardClient = await this.shardManager.getShardClient(shardInfo.shard)

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
      // console.log({
      //   createdAt: cursor.createdAt,
      //   id: cursor.id,
      //   shard: shardInfo.shard,
      // })
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
    if (hasMore && resultMessages.length > 0) {
      const lastMessage = resultMessages.at(-1)
      if (lastMessage) {
        nextCursor = this.buildNextCursor(lastMessage, shardInfo.shard.id)
      }
    }

    return {
      data: messagesWithAttachments,
      nextCursor,
    }
  }
}
