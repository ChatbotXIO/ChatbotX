import {
  invalidateCacheByTags,
  distributedLock as redisDistributedLock,
  withCache,
} from "@chatbotx.io/redis"
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
import {
  isMessageStorageError,
  MessageShardUnavailableError,
} from "../../../errors"
import { logger } from "../../../logger"
import { getSafeSinceTime } from "../../../repositories"
import type {
  AttachmentLookupRow,
  BulkCreateAttachmentInput,
  BulkPatchContentAttributesParams,
  CreateAttachmentInput,
  CreateMessageInput,
  CreateMessageResult,
  DistributedLock,
  FindAIContextMessagesOptions,
  FindAttachmentByIdParams,
  FindLastByConversationOptions,
  FindManyByConversationOptions,
  FindManyBySourceIdsParams,
  FindMessageByIdParams,
  FindRichResponseByButtonParams,
  FindTriggerMessageOptions,
  HardDeleteAllByContactInboxParams,
  HardDeleteAllByContactInboxResult,
  IMessageRepository,
  ListIncomingTextsByContactInboxParams,
  ListMessagesQuery,
  MessageSourceRow,
  MessageWithAttachments,
  PaginatedMessages,
  PaginationCursor,
  UpdateAttachmentParams,
} from "../../../repositories/message/message-repository"
import type { RichResponseContentAttributes } from "../../../schema"
import type { AttachmentModel, MessageModel } from "../../../types"
import {
  endOfHour,
  rehydrateTimeRangeDates,
  startOfHour,
  withShardRetry,
} from "../../shared"
import type { MessageShardDatabaseClient } from "../client"
import type { MessageShardConnectionManager } from "../connection-manager"
import type { MessageShardTimeRangeInfo } from "../registry"
import { attachmentModel, messageModel } from "../shard-schema"

export { getSafeSinceTime } from "../../../repositories"

const SHARD_RANGE_CACHE_TAG = "message-shard-range"
const SHARD_RANGE_CACHE_TTL_S = 30
const ATTACHMENT_FALLBACK_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000
const RICH_RESPONSE_FALLBACK_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000
// Echo dedup lookback. An outbound message we save is echoed back by the channel
// (Instagram/Messenger) seconds later carrying the same sourceId (mid). The dedup
// guard read must look back past the echo's own createdAt to find the already-saved
// row; a day comfortably covers channel echo latency plus webhook redelivery.
const ECHO_DEDUP_LOOKBACK_MS = 24 * 60 * 60 * 1000
const LIST_INCOMING_TEXTS_BATCH_SIZE = 1000

function dedupeShardsByPhysicalId<T extends { shard: { id: string } }>(
  shards: T[],
): T[] {
  const seen = new Set<string>()
  return shards.filter((shard) => {
    if (seen.has(shard.shard.id)) {
      return false
    }
    seen.add(shard.shard.id)
    return true
  })
}

function compareMessageDesc(
  a: { id: string; createdAt: Date },
  b: { id: string; createdAt: Date },
): number {
  const timeDiff = b.createdAt.getTime() - a.createdAt.getTime()
  if (timeDiff !== 0) {
    return timeDiff
  }
  try {
    const diff = BigInt(b.id) - BigInt(a.id)
    if (diff > 0n) {
      return 1
    }
    if (diff < 0n) {
      return -1
    }
    return 0
  } catch {
    return b.id.localeCompare(a.id)
  }
}

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

    return dedupeShardsByPhysicalId(rehydrateTimeRangeDates(cached))
  }

  /**
   * Union the workspace's write shard into a time-range shard set.
   *
   * Writes route by workspace hash and preserve each message's original
   * createdAt, so back-dated (historical-import) rows live in the active write
   * shard even though its registered time-range starts at activation. A purely
   * time-based read can exclude that shard when the query window predates
   * activation, hiding rows that physically exist. Appending the write shard
   * (deduped by shard id) guarantees it is always queried. It is appended last
   * so it sorts as the newest shard once the caller reverses to descending.
   */
  private mergeWriteShard(
    timeRangeShards: MessageShardTimeRangeInfo[],
    writeShard: MessageShardTimeRangeInfo | null,
  ): MessageShardTimeRangeInfo[] {
    if (!writeShard) {
      return timeRangeShards
    }
    const alreadyIncluded = timeRangeShards.some(
      (s) => s.shard.id === writeShard.shard.id,
    )
    if (alreadyIncluded) {
      return timeRangeShards
    }
    return [...timeRangeShards, writeShard]
  }

  private async getConversationReadShards(
    sinceTime: Date,
    workspaceId?: string,
  ): Promise<MessageShardTimeRangeInfo[]> {
    const timeRangeShards = await this.getShardsForRange(sinceTime, new Date())
    const writeShard = workspaceId
      ? await this.shardManager.getWriteShardInfo(workspaceId)
      : null
    return this.mergeWriteShard(timeRangeShards, writeShard)
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

  private toStorageError(action: string, error: unknown): Error {
    if (isMessageStorageError(error)) {
      return error
    }
    return new MessageShardUnavailableError(
      `Message shard operation failed: ${action}`,
    )
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

  private mapMessagesToWithAttachmentCounts(
    messages: MessageModel[],
    attachmentCountByMessageId: Record<string, number>,
  ): MessageWithAttachments[] {
    return messages.map(
      (message) =>
        ({
          ...message,
          attachmentCount: attachmentCountByMessageId[message.id] ?? 0,
          attachments: [],
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

  private groupAttachmentCountsByMessageId(
    rows: { messageId: string; count: number }[],
  ): Record<string, number> {
    return rows.reduce(
      (acc, row) => {
        acc[row.messageId] = Number(row.count)
        return acc
      },
      {} as Record<string, number>,
    )
  }

  private async fetchAttachmentCounts(
    shardClient: MessageShardDatabaseClient,
    messages: { id: string; createdAt: Date }[],
  ): Promise<Record<string, number>> {
    const messageIds = messages.map((m) => m.id)
    const messageCreatedAts = messages.map((m) => m.createdAt)
    const rows = await this.queryAttachmentCountsForMessages(
      shardClient,
      messageIds,
      messageCreatedAts,
    )
    return this.groupAttachmentCountsByMessageId(rows)
  }

  private async queryAttachmentCountsForMessages(
    db: MessageShardDatabaseClient,
    messageIds: string[],
    messageCreatedAts?: Date[],
  ): Promise<{ messageId: string; count: number }[]> {
    if (messageIds.length === 0) {
      return []
    }

    const countColumn = sql<number>`count(*)`.as("count")

    if (messageCreatedAts && messageCreatedAts.length === messageIds.length) {
      const perMessageConditions = messageIds.map((id, i) =>
        and(
          eq(attachmentModel.messageId, id),
          eq(attachmentModel.messageCreatedAt, messageCreatedAts[i]),
        ),
      )
      return await db
        .select({ messageId: attachmentModel.messageId, count: countColumn })
        .from(attachmentModel)
        .where(or(...perMessageConditions))
        .groupBy(attachmentModel.messageId)
    }

    return await db
      .select({ messageId: attachmentModel.messageId, count: countColumn })
      .from(attachmentModel)
      .where(inArray(attachmentModel.messageId, messageIds))
      .groupBy(attachmentModel.messageId)
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

  /**
   * Idempotent insert used by the create-or-update paths. Mirrors {@link create}
   * but tolerates a concurrent/duplicate write: the Messenger echo webhook (and
   * its retries) can deliver the same message twice, and the dedup unique index
   * `Message_source_dedup_idx` (contactInboxId, sourceId, createdAt) would
   * otherwise make the second INSERT throw. On conflict this returns `null`
   * instead of throwing so the caller can re-fetch the existing row.
   */
  private insertIgnoringConflict(
    message: CreateMessageInput,
  ): Promise<MessageModel | null> {
    return withShardRetry(async () => {
      const db = await this.shardManager.getShardForWrite(message.workspaceId)
      const [result] = await db
        .insert(messageModel)
        .values(message as typeof messageModel.$inferInsert)
        .onConflictDoNothing({
          target: [
            messageModel.contactInboxId,
            messageModel.sourceId,
            messageModel.createdAt,
          ],
        })
        .returning()
      return (result as MessageModel) ?? null
    })
  }

  /**
   * Log a message-save failure with the underlying Postgres cause surfaced.
   * Drizzle wraps the driver error ("Failed query: insert into Message ...") and
   * hides the real reason in `error.cause`; extracting `code`/`constraint`/
   * `detail` here distinguishes a unique-violation (23505, handled by the dedup
   * safety net) from a TimescaleDB decompression failure (needs a config fix).
   */
  private logSaveFailure(
    action: string,
    message: CreateMessageInput,
    error: unknown,
  ): void {
    const rawCause =
      error instanceof Error && error.cause instanceof Error
        ? (error.cause as Error & {
            code?: unknown
            constraint?: unknown
            detail?: unknown
            table?: unknown
          })
        : undefined
    const cause = rawCause
      ? {
          message: rawCause.message,
          code: rawCause.code,
          constraint: rawCause.constraint,
          detail: rawCause.detail,
          table: rawCause.table,
        }
      : undefined
    logger.error(
      {
        err: error,
        cause,
        action,
        conversationId: message.conversationId,
        sourceId: message.sourceId,
        workspaceId: message.workspaceId,
      },
      `Failed to save incoming message via ${action}`,
    )
  }

  /**
   * Read the row a dedup conflict proved exists directly from the write shard
   * (primary). findBySourceId reads replicas, which can still lag right after a
   * concurrent insert; the write shard is authoritative. Scoped to the same
   * (contactInboxId, sourceId, createdAt) the unique index rejected — createdAt
   * is always set on the conflict path (a conflict on that key requires it).
   */
  private async findOnWriteShardBySource(
    message: CreateMessageInput,
  ): Promise<MessageModel | null> {
    if (!(message.sourceId && message.createdAt)) {
      return null
    }
    const db = await this.shardManager.getShardForWrite(message.workspaceId)
    const [row] = await db
      .select()
      .from(messageModel)
      .where(
        and(
          eq(messageModel.contactInboxId, message.contactInboxId),
          eq(messageModel.sourceId, message.sourceId),
          eq(messageModel.createdAt, message.createdAt),
        ),
      )
      .limit(1)
    return (row as MessageModel) ?? null
  }

  async bulkCreate(
    messages: CreateMessageInput[],
  ): Promise<{ id: string; sourceId: string | null }[]> {
    if (messages.length === 0) {
      return []
    }

    const workspaceId = messages[0].workspaceId
    if (messages.some((m) => m.workspaceId !== workspaceId)) {
      throw new Error(
        "bulkCreate: all messages must belong to the same workspace",
      )
    }

    return await withShardRetry(async () => {
      const shardDb = await this.shardManager.getShardForWrite(workspaceId)

      const CHUNK_SIZE = 1000
      const inserted: { id: string; sourceId: string | null }[] = []

      for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
        const chunk = messages.slice(i, i + CHUNK_SIZE)
        const rows = await shardDb
          .insert(messageModel)
          .values(chunk as (typeof messageModel.$inferInsert)[])
          .onConflictDoNothing({
            target: [
              messageModel.contactInboxId,
              messageModel.sourceId,
              messageModel.createdAt,
            ],
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
    })
  }

  updateMessageAttributes(
    messageId: string,
    workspaceId: string,
    attributes: { liked: boolean; hidden: boolean },
    createdAt: Date,
  ): Promise<{ id: string } | null> {
    return this.updateAcrossShards(
      messageId,
      workspaceId,
      { attributes },
      "updateMessageAttributes",
      createdAt,
    )
  }

  updateMessageText(
    messageId: string,
    workspaceId: string,
    newText: string,
    createdAt: Date,
  ): Promise<{ id: string } | null> {
    return this.updateAcrossShards(
      messageId,
      workspaceId,
      { text: newText },
      "updateMessageText",
      createdAt,
    )
  }

  async updateTextBySourceId(
    sourceId: string,
    workspaceId: string,
    newText: string,
  ): Promise<{ id: string } | null> {
    // sourceId-based update: scan shards from the last 90 days (same window
    // used by findBySourceId for parent-comment lookups).
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    const writeShard = await this.shardManager.getWriteShardInfo(workspaceId)
    const timeShards = await this.getShardsForRange(since, new Date())
    const shards = this.mergeWriteShard(timeShards, writeShard)

    for (const shardInfo of shards) {
      try {
        const client = await this.shardManager.getShardClient(shardInfo.shard)
        const [row] = await client
          .update(messageModel)
          .set({ text: newText })
          .where(
            and(
              eq(messageModel.sourceId, sourceId),
              eq(messageModel.workspaceId, workspaceId),
            ),
          )
          .returning({ id: messageModel.id })
        if (row) {
          return row as { id: string }
        }
      } catch (error) {
        logger.warn(
          { err: error, shardId: shardInfo.shard.id },
          "Shard update failed in updateTextBySourceId",
        )
      }
    }
    return null
  }

  // Targets the 1-2 shards covering the message's createdAt plus the write
  // shard (for back-dated imports). When createdAt is unknown it is resolved
  // first via a lightweight SELECT, avoiding a full shard scan.
  private async updateAcrossShards(
    messageId: string,
    workspaceId: string,
    patch: Partial<typeof messageModel.$inferInsert>,
    caller: string,
    createdAt: Date,
  ): Promise<{ id: string } | null> {
    const timeRangeShards = await this.getShardsForRange(createdAt, createdAt)
    const writeShard = await this.shardManager.getWriteShardInfo(workspaceId)
    const shards = this.mergeWriteShard(timeRangeShards, writeShard)
    if (shards.length === 0) {
      return null
    }

    const perShard = await Promise.all(
      shards.map(async (shardInfo) => {
        try {
          const client = await this.shardManager.getShardClient(shardInfo.shard)
          return await client
            .update(messageModel)
            .set(patch)
            .where(
              and(
                eq(messageModel.id, messageId),
                eq(messageModel.workspaceId, workspaceId),
                eq(messageModel.createdAt, createdAt),
              ),
            )
            .returning({ id: messageModel.id })
        } catch (error) {
          logger.warn(
            { err: error, shardId: shardInfo.shard.id },
            `Shard update failed in ${caller}`,
          )
          return []
        }
      }),
    )

    return perShard.flat()[0] ?? null
  }

  async deleteAttachmentsByMessageId(
    messageId: string,
    workspaceId: string,
    createdAt: Date,
  ): Promise<void> {
    const timeRangeShards = await this.getShardsForRange(createdAt, createdAt)
    const writeShard = await this.shardManager.getWriteShardInfo(workspaceId)
    const shards = this.mergeWriteShard(timeRangeShards, writeShard)

    await Promise.allSettled(
      shards.map(async (shardInfo) => {
        try {
          const client = await this.shardManager.getShardClient(shardInfo.shard)
          await client
            .delete(attachmentModel)
            .where(
              and(
                eq(attachmentModel.messageId, messageId),
                eq(attachmentModel.workspaceId, workspaceId),
              ),
            )
        } catch (err) {
          logger.warn(
            { err, messageId },
            "deleteAttachmentsByMessageId: shard failed",
          )
        }
      }),
    )
  }

  updateSendError(
    id: string,
    sendError: string | null,
    workspaceId: string,
    createdAt: Date,
  ): Promise<{ id: string } | null> {
    return this.updateAcrossShards(
      id,
      workspaceId,
      { sendError },
      "updateSendError",
      createdAt,
    )
  }

  updateSourceId(
    id: string,
    sourceId: string,
    workspaceId: string,
    createdAt: Date,
  ): Promise<{ id: string } | null> {
    return this.updateAcrossShards(
      id,
      workspaceId,
      { sourceId },
      "updateSourceId",
      createdAt,
    )
  }

  async deleteBySourceId(
    sourceId: string,
    workspaceId: string,
    createdAt: Date,
  ): Promise<{ id: string }[]> {
    const writeShard = await this.shardManager.getWriteShardInfo(workspaceId)

    // Step 1: find parent DB id — search in createdAt shard + write shard only.
    const parentTimeShards = await this.getShardsForRange(
      createdAt,
      endOfHour(createdAt),
    )
    const parentShards = this.mergeWriteShard(parentTimeShards, writeShard)

    let parentDbId: string | null = null
    for (const shardInfo of parentShards) {
      try {
        const client = await this.shardManager.getShardClient(shardInfo.shard)
        const [parent] = await client
          .select({ id: messageModel.id })
          .from(messageModel)
          .where(
            and(
              eq(messageModel.workspaceId, workspaceId),
              eq(messageModel.sourceId, sourceId),
            ),
          )
          .limit(1)
        if (parent) {
          parentDbId = parent.id
          break
        }
      } catch (error) {
        logger.warn(
          { err: error, shardId: shardInfo.shard.id },
          "Shard query failed while looking up parent in deleteBySourceId",
        )
      }
    }

    // Step 2: soft-delete parent + children.
    // Parent lives in its createdAt shard; children (replies) can be in any
    // shard from createdAt onwards.
    const childTimeShards = await this.getShardsForRange(createdAt, new Date())
    const shards = this.mergeWriteShard(childTimeShards, writeShard)

    if (shards.length === 0) {
      return []
    }

    const perShard = await Promise.all(
      shards.map(async (shardInfo) => {
        try {
          const client = await this.shardManager.getShardClient(shardInfo.shard)
          return await client
            .update(messageModel)
            .set({ deletedAt: new Date() })
            .where(
              and(
                eq(messageModel.workspaceId, workspaceId),
                or(
                  eq(messageModel.sourceId, sourceId),
                  parentDbId
                    ? eq(messageModel.parentId, parentDbId)
                    : undefined,
                ),
              ),
            )
            .returning({ id: messageModel.id })
        } catch (error) {
          logger.warn(
            { err: error, shardId: shardInfo.shard.id },
            "Shard update failed in deleteBySourceId",
          )
          return []
        }
      }),
    )

    const ids = new Set<string>()
    for (const rows of perShard) {
      for (const row of rows) {
        ids.add(row.id)
      }
    }
    return [...ids].map((id) => ({ id }))
  }

  async deleteById(
    id: string,
    workspaceId: string,
    createdAt: Date,
  ): Promise<{ id: string }[]> {
    const shards = await this.getShardsForRange(createdAt, createdAt)
    if (shards.length === 0) {
      return []
    }

    for (const shardInfo of shards) {
      try {
        const client = await this.shardManager.getShardClient(shardInfo.shard)
        const rows = await client
          .update(messageModel)
          .set({ deletedAt: new Date() })
          .where(
            and(
              eq(messageModel.workspaceId, workspaceId),
              eq(messageModel.id, id),
              eq(messageModel.createdAt, createdAt),
            ),
          )
          .returning({ id: messageModel.id })
        if (rows.length > 0) {
          return rows as { id: string }[]
        }
      } catch (error) {
        logger.warn(
          { err: error, shardId: shardInfo.shard.id },
          "Shard update failed in deleteById",
        )
      }
    }
    return []
  }

  async listIncomingTextsByContactInbox({
    contactInboxId,
    limit,
    sinceTime,
    workspaceId,
  }: ListIncomingTextsByContactInboxParams): Promise<string[]> {
    const writeShard = await this.shardManager.getWriteShardInfo(workspaceId)
    const timeRangeShards = await this.getShardsForRange(sinceTime, new Date())

    const shards = this.mergeWriteShard(timeRangeShards, writeShard)
    if (shards.length === 0) {
      return []
    }

    const messages: string[] = []
    const newestShardsFirst = [...shards].reverse()

    for (const shardInfo of newestShardsFirst) {
      if (limit !== undefined && messages.length >= limit) {
        break
      }

      try {
        await this.shardManager.withShardClientForRead(
          shardInfo.shard,
          async (shardClient) => {
            let cursor: { createdAt: Date; id: string } | null = null

            while (true) {
              if (limit !== undefined && messages.length >= limit) {
                break
              }

              let remainingLimit = LIST_INCOMING_TEXTS_BATCH_SIZE
              if (limit !== undefined) {
                remainingLimit = Math.min(
                  LIST_INCOMING_TEXTS_BATCH_SIZE,
                  limit - messages.length,
                )
              }

              const whereConditions = [
                eq(messageModel.workspaceId, workspaceId),
                eq(messageModel.contactInboxId, contactInboxId),
                eq(messageModel.messageType, "incoming"),
                isNotNull(messageModel.text),
                isNull(messageModel.deletedAt),
                gte(messageModel.createdAt, sinceTime),
              ]

              if (cursor !== null) {
                const cursorCondition = or(
                  lt(messageModel.createdAt, cursor.createdAt),
                  and(
                    eq(messageModel.createdAt, cursor.createdAt),
                    lt(messageModel.id, cursor.id),
                  ),
                )
                if (cursorCondition) {
                  whereConditions.push(cursorCondition)
                }
              }

              const rows = await shardClient
                .select({
                  createdAt: messageModel.createdAt,
                  id: messageModel.id,
                  text: messageModel.text,
                })
                .from(messageModel)
                .where(and(...whereConditions))
                .orderBy(desc(messageModel.createdAt), desc(messageModel.id))
                .limit(remainingLimit)

              for (const row of rows) {
                if (row.text !== null) {
                  messages.push(row.text)
                }
              }

              if (rows.length < remainingLimit) {
                break
              }

              const lastRow = rows.at(-1)
              if (!lastRow) {
                break
              }
              cursor = { createdAt: lastRow.createdAt, id: lastRow.id }
            }
          },
        )
      } catch (error) {
        logger.warn(
          { err: error, shardId: shardInfo.shard.id, contactInboxId },
          "Shard query failed in listIncomingTextsByContactInbox",
        )
      }
    }

    return messages
  }

  async hardDeleteAllByContactInbox({
    contactInboxId,
    sinceTime,
    workspaceId,
  }: HardDeleteAllByContactInboxParams): Promise<HardDeleteAllByContactInboxResult> {
    const shards = await this.getConversationReadShards(sinceTime, workspaceId)
    if (shards.length === 0) {
      return { attachmentPaths: [] }
    }

    const results = await Promise.allSettled(
      shards.map(async (shardInfo): Promise<string[]> => {
        const client = await this.shardManager.getShardClient(shardInfo.shard)
        const messageWhereConditions = [
          eq(messageModel.workspaceId, workspaceId),
          eq(messageModel.contactInboxId, contactInboxId),
          gte(messageModel.createdAt, sinceTime),
        ]

        const attachmentMessageExists = sql`EXISTS (
          SELECT 1
          FROM ${messageModel}
          WHERE ${messageModel.workspaceId} = ${workspaceId}
            AND ${messageModel.createdAt} >= ${sinceTime}
            AND ${messageModel.id} = ${attachmentModel.messageId}
            AND ${messageModel.createdAt} = ${attachmentModel.messageCreatedAt}
            AND ${messageModel.contactInboxId} = ${contactInboxId}
        )`
        const attachmentWhereConditions = [
          eq(attachmentModel.workspaceId, workspaceId),
          attachmentMessageExists,
        ]

        const attachments = await client
          .select({
            originPath: attachmentModel.originPath,
            thumbnailPath: attachmentModel.thumbnailPath,
          })
          .from(attachmentModel)
          .where(and(...attachmentWhereConditions))

        await client
          .delete(attachmentModel)
          .where(and(...attachmentWhereConditions))

        await client.delete(messageModel).where(and(...messageWhereConditions))

        return attachments.flatMap((attachment) =>
          [attachment.originPath, attachment.thumbnailPath].filter(
            (path): path is string => Boolean(path),
          ),
        )
      }),
    )

    const attachmentPaths = new Set<string>()
    let firstError: unknown = null
    for (const result of results) {
      if (result.status === "fulfilled") {
        for (const path of result.value) {
          attachmentPaths.add(path)
        }
        continue
      }
      if (firstError === null) {
        firstError = result.reason
      }
      logger.warn(
        { err: result.reason, contactInboxId },
        "Shard delete failed in hardDeleteAllByContactInbox",
      )
    }

    if (firstError) {
      throw this.toStorageError(
        "hard delete messages by contact inbox",
        firstError,
      )
    }

    return { attachmentPaths: [...attachmentPaths] }
  }

  async bulkCreateAttachments(
    attachments: BulkCreateAttachmentInput[],
  ): Promise<{ id: string }[]> {
    if (attachments.length === 0) {
      return []
    }
    const workspaceId = attachments[0].workspaceId
    return await withShardRetry(async () => {
      const shardDb = await this.shardManager.getShardForWrite(workspaceId)
      return await shardDb
        .insert(attachmentModel)
        .values(
          attachments.map((a) => ({
            id: a.id,
            workspaceId: a.workspaceId,
            conversationId: a.conversationId,
            fileType:
              a.fileType as (typeof attachmentModel.$inferInsert)["fileType"],
            messageId: a.messageId,
            messageCreatedAt: a.messageCreatedAt,
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
          getSafeSinceTime(message.createdAt, ECHO_DEDUP_LOOKBACK_MS),
        )
        if (existing) {
          return { message: existing, isNew: false }
        }

        // Only a genuine DB error (e.g. TimescaleDB decompression, connection
        // loss) should throw here; a dedup conflict is a normal, expected
        // outcome handled below — not an error.
        let created: MessageModel | null
        try {
          created = await this.insertIgnoringConflict(message)
        } catch (error) {
          this.logSaveFailure("createOrUpdate", message, error)
          throw error
        }
        if (created) {
          return { message: created, isNew: true }
        }

        // Conflict: the dedup index already holds this message (echo redelivery,
        // or read-replica lag on the guard read above). Idempotent no-op — log
        // at info and return the existing row instead of throwing. Try a replica
        // read first; if it still lags, read the write shard (primary), which is
        // guaranteed to see the row the conflict proved exists.
        const raced =
          (await this.findBySourceId(
            message.sourceId as string,
            message.conversationId,
            message.workspaceId,
            getSafeSinceTime(message.createdAt, ECHO_DEDUP_LOOKBACK_MS),
          )) ?? (await this.findOnWriteShardBySource(message))
        logger.info(
          {
            conversationId: message.conversationId,
            sourceId: message.sourceId,
            workspaceId: message.workspaceId,
          },
          "Duplicate message skipped (dedup conflict)",
        )
        if (raced) {
          return { message: raced, isNew: false }
        }
        // Unreachable in practice (the primary must see a committed conflicting
        // row). Non-throwing best-effort so the flow still advances in order.
        logger.warn(
          {
            conversationId: message.conversationId,
            sourceId: message.sourceId,
            workspaceId: message.workspaceId,
          },
          "Dedup conflict but row unreadable even on the write shard",
        )
        return { message: message as unknown as MessageModel, isNew: false }
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
    return withShardRetry(async () => {
      // Plain create path: no ignoreConflict, so a real duplicate throws rather
      // than returning null. A null here would be unexpected.
      const created = await this.createWithAttachmentsInternal(
        message,
        attachments,
      )
      if (!created) {
        throw new MessageShardUnavailableError(
          "createWithAttachments: insert returned no row",
        )
      }
      return created
    })
  }

  private async createWithAttachmentsInternal(
    message: CreateMessageInput,
    attachments: Omit<
      CreateAttachmentInput,
      "messageId" | "messageCreatedAt"
    >[],
    options?: { ignoreConflict?: boolean },
  ): Promise<MessageWithAttachments | null> {
    const db = await this.shardManager.getShardForWrite(message.workspaceId)

    return db.transaction(async (tx) => {
      // When ignoreConflict is set (create-or-update path), a duplicate row must
      // not throw — the dedup index rejects it and we return null so the caller
      // re-fetches. Without it (plain create path), a duplicate throws as before.
      const rows = options?.ignoreConflict
        ? await tx
            .insert(messageModel)
            .values(message as typeof messageModel.$inferInsert)
            .onConflictDoNothing({
              target: [
                messageModel.contactInboxId,
                messageModel.sourceId,
                messageModel.createdAt,
              ],
            })
            .returning()
        : await tx
            .insert(messageModel)
            .values(message as typeof messageModel.$inferInsert)
            .returning()
      const [newMessage] = rows

      if (!newMessage) {
        // Conflict under ignoreConflict: an equivalent message already exists.
        // Skip attachment inserts (they would reference a nonexistent message id)
        // and signal the conflict to the caller.
        return null
      }

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

      const buildExistingResult = async (
        existing: MessageModel,
      ): Promise<{ result: MessageWithAttachments; isNew: false }> => {
        const existingWithAttachments = await this.findById({
          id: existing.id,
          createdAt: existing.createdAt,
          workspaceId: message.workspaceId,
        })
        return {
          result: existingWithAttachments ?? { ...existing, attachments: [] },
          isNew: false,
        }
      }

      const resolveExisting = async (): Promise<{
        result: MessageWithAttachments
        isNew: boolean
      } | null> => {
        const existing = await this.findBySourceId(
          message.sourceId as string,
          message.conversationId,
          message.workspaceId,
          getSafeSinceTime(message.createdAt, ECHO_DEDUP_LOOKBACK_MS),
        )
        return existing ? await buildExistingResult(existing) : null
      }

      const doCreateOrUpdate = async (): Promise<{
        result: MessageWithAttachments
        isNew: boolean
      }> => {
        const existing = await resolveExisting()
        if (existing) {
          return existing
        }

        // Only a genuine DB error should throw; a dedup conflict is expected and
        // handled below as an idempotent no-op.
        let created: MessageWithAttachments | null
        try {
          created = await withShardRetry(() =>
            this.createWithAttachmentsInternal(message, attachments, {
              ignoreConflict: true,
            }),
          )
        } catch (error) {
          this.logSaveFailure("createOrUpdateWithAttachments", message, error)
          throw error
        }
        if (created) {
          return { result: created, isNew: true }
        }

        // Conflict: idempotent no-op. Re-read via replica, then the write shard
        // (primary) which is guaranteed to see the conflicting row.
        const racedBase =
          (await this.findBySourceId(
            message.sourceId as string,
            message.conversationId,
            message.workspaceId,
            getSafeSinceTime(message.createdAt, ECHO_DEDUP_LOOKBACK_MS),
          )) ?? (await this.findOnWriteShardBySource(message))
        logger.info(
          {
            conversationId: message.conversationId,
            sourceId: message.sourceId,
            workspaceId: message.workspaceId,
          },
          "Duplicate message skipped (dedup conflict)",
        )
        if (racedBase) {
          return await buildExistingResult(racedBase)
        }
        // Unreachable in practice. Non-throwing best-effort.
        logger.warn(
          {
            conversationId: message.conversationId,
            sourceId: message.sourceId,
            workspaceId: message.workspaceId,
          },
          "Dedup conflict but row unreadable even on the write shard",
        )
        return {
          result: {
            ...(message as unknown as MessageModel),
            attachments: [],
          } as MessageWithAttachments,
          isNew: false,
        }
      }

      return this.executeWithLock(lockKey, doCreateOrUpdate)
    }
    // No sourceId to dedup on: plain create path, no ignoreConflict, so a real
    // duplicate throws rather than returning null.
    const created = await withShardRetry(async () => {
      const result = await this.createWithAttachmentsInternal(
        message,
        attachments,
      )
      if (!result) {
        throw new MessageShardUnavailableError(
          "createOrUpdateWithAttachments: insert returned no row",
        )
      }
      return result
    })
    return { result: created, isNew: true }
  }

  async findById({
    id,
    createdAt,
    workspaceId,
  }: FindMessageByIdParams): Promise<MessageWithAttachments | null> {
    const shards = await this.getConversationReadShards(createdAt, workspaceId)
    if (shards.length === 0) {
      return null
    }

    for (const shardInfo of shards) {
      try {
        const found = await this.shardManager.withShardClientForRead(
          shardInfo.shard,
          async (shardClient) => {
            const [message] = await shardClient
              .select()
              .from(messageModel)
              .where(
                and(
                  eq(messageModel.id, id),
                  eq(messageModel.createdAt, createdAt),
                  eq(messageModel.workspaceId, workspaceId),
                ),
              )
              .limit(1)

            if (!message) {
              return null
            }

            const attachments = await this.queryAttachmentsForMessages(
              shardClient,
              [id],
              [message.createdAt],
            )
            return { ...message, attachments } as MessageWithAttachments
          },
        )
        if (found) {
          return found
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

  async findAIContextMessages(
    options: FindAIContextMessagesOptions,
  ): Promise<MessageModel[]> {
    if (!options.sinceTime) {
      throw new MessageShardUnavailableError(
        "sinceTime is required for sharded AI context reads",
      )
    }

    let shards: MessageShardTimeRangeInfo[]
    try {
      shards = await this.getConversationReadShards(
        options.sinceTime,
        options.workspaceId,
      )
    } catch (error) {
      throw this.toStorageError("select shards for AI context read", error)
    }

    if (shards.length === 0) {
      throw new MessageShardUnavailableError(
        "No message shards are available for AI context read",
      )
    }

    let marker: Pick<MessageModel, "createdAt" | "id"> | null = null
    if (options.markerMessageId) {
      const markerResults = await Promise.all(
        shards.map(async (shardInfo) => {
          try {
            return await this.shardManager.withShardClientForRead(
              shardInfo.shard,
              async (shardClient) => {
                const [result] = await shardClient
                  .select({
                    createdAt: messageModel.createdAt,
                    id: messageModel.id,
                  })
                  .from(messageModel)
                  .where(
                    and(
                      eq(messageModel.id, options.markerMessageId as string),
                      eq(messageModel.conversationId, options.conversationId),
                      eq(messageModel.workspaceId, options.workspaceId),
                    ),
                  )
                  .limit(1)
                return result ?? null
              },
            )
          } catch (error) {
            throw this.toStorageError("find AI context marker", error)
          }
        }),
      )

      marker = markerResults.find((result) => result !== null) ?? null
    }

    const shardResults = await Promise.all(
      shards.map(async (shardInfo): Promise<MessageModel[]> => {
        try {
          return await this.shardManager.withShardClientForRead(
            shardInfo.shard,
            async (shardClient) => {
              const whereConditions = [
                eq(messageModel.conversationId, options.conversationId),
                eq(messageModel.workspaceId, options.workspaceId),
                gte(messageModel.createdAt, options.sinceTime as Date),
              ]
              if (options.messageTypes && options.messageTypes.length > 0) {
                whereConditions.push(
                  inArray(messageModel.messageType, options.messageTypes),
                )
              }
              if (options.textNotNull) {
                whereConditions.push(isNotNull(messageModel.text))
              }

              if (marker) {
                const afterMarker = or(
                  gt(messageModel.createdAt, marker.createdAt),
                  and(
                    eq(messageModel.createdAt, marker.createdAt),
                    gt(messageModel.id, marker.id),
                  ),
                )
                if (afterMarker) {
                  whereConditions.push(afterMarker)
                }
              }

              return (await shardClient
                .select()
                .from(messageModel)
                .where(and(...whereConditions))
                .orderBy(desc(messageModel.createdAt), desc(messageModel.id))
                .limit(options.limit)) as MessageModel[]
            },
          )
        } catch (error) {
          throw this.toStorageError("find AI context messages", error)
        }
      }),
    )

    return shardResults
      .flat()
      .sort(compareMessageDesc)
      .slice(0, options.limit)
      .reverse()
  }

  findTriggerMessage(
    options: FindTriggerMessageOptions,
  ): Promise<MessageWithAttachments | null> {
    return this.findByIdInConversation(
      options.id,
      options.conversationId,
      options.sinceTime,
      options.requireCompleteResults,
      options.workspaceId,
    )
  }

  async findRichResponseByButton({
    buttonId,
    contactInboxId,
    conversationId,
    messageId,
    sinceTime,
    workspaceId,
  }: FindRichResponseByButtonParams): Promise<RichResponseContentAttributes | null> {
    const lookupSinceTime =
      sinceTime ?? new Date(Date.now() - RICH_RESPONSE_FALLBACK_LOOKBACK_MS)
    const shards = await this.getConversationReadShards(
      lookupSinceTime,
      workspaceId,
    )
    if (shards.length === 0) {
      return null
    }

    if (messageId) {
      for (const shardInfo of shards) {
        try {
          const richResponse = await this.shardManager.withShardClientForRead(
            shardInfo.shard,
            async (shardClient) => {
              const [message] = await shardClient
                .select({ contentAttributes: messageModel.contentAttributes })
                .from(messageModel)
                .where(
                  and(
                    eq(messageModel.id, messageId),
                    eq(messageModel.workspaceId, workspaceId),
                    eq(messageModel.conversationId, conversationId),
                    eq(messageModel.contactInboxId, contactInboxId),
                    gte(messageModel.createdAt, lookupSinceTime),
                  ),
                )
                .limit(1)

              const richResponse =
                message?.contentAttributes?.richResponse ?? null
              if (!richResponse) {
                return null
              }
              return richResponse.buttonPayloads[buttonId]
                ? richResponse
                : { missingButtonPayload: true as const }
            },
          )
          if (richResponse === null) {
            continue
          }
          if ("missingButtonPayload" in richResponse) {
            return null
          }
          if (richResponse) {
            return richResponse
          }
        } catch (error) {
          logger.warn(
            { err: error, shardId: shardInfo.shard.id },
            "Shard query failed in findRichResponseByButton by message id",
          )
        }
      }
    }

    const results = await Promise.all(
      shards.map(
        async (
          shardInfo,
        ): Promise<{
          createdAt: Date
          id: string
          richResponse: RichResponseContentAttributes
        } | null> => {
          try {
            return await this.shardManager.withShardClientForRead(
              shardInfo.shard,
              async (shardClient) => {
                const [message] = await shardClient
                  .select({
                    contentAttributes: messageModel.contentAttributes,
                    createdAt: messageModel.createdAt,
                    id: messageModel.id,
                  })
                  .from(messageModel)
                  .where(
                    and(
                      eq(messageModel.workspaceId, workspaceId),
                      eq(messageModel.conversationId, conversationId),
                      eq(messageModel.contactInboxId, contactInboxId),
                      gte(messageModel.createdAt, lookupSinceTime),
                      sql`${messageModel.contentAttributes}->'richResponse'->'buttonPayloads' ? ${buttonId}`,
                    ),
                  )
                  .orderBy(desc(messageModel.createdAt), desc(messageModel.id))
                  .limit(1)

                const richResponse =
                  message?.contentAttributes?.richResponse ?? null
                return richResponse
                  ? {
                      createdAt: message.createdAt,
                      id: message.id,
                      richResponse,
                    }
                  : null
              },
            )
          } catch (error) {
            logger.warn(
              { err: error, shardId: shardInfo.shard.id },
              "Shard query failed in findRichResponseByButton by button id",
            )
            return null
          }
        },
      ),
    )

    return (
      results
        .filter((result): result is NonNullable<typeof result> => !!result)
        .sort(compareMessageDesc)[0]?.richResponse ?? null
    )
  }

  private async findByIdInConversation(
    id: string,
    conversationId: string,
    sinceTime: Date,
    requireCompleteResults: boolean | undefined,
    workspaceId: string,
  ): Promise<MessageWithAttachments | null> {
    let shards: MessageShardTimeRangeInfo[]
    try {
      shards = await this.getConversationReadShards(sinceTime, workspaceId)
    } catch (error) {
      if (requireCompleteResults) {
        throw this.toStorageError(
          "select shards for message by id in conversation",
          error,
        )
      }
      logger.warn(
        { err: error },
        "Shard selection failed in findByIdInConversation",
      )
      return null
    }
    if (shards.length === 0) {
      if (requireCompleteResults) {
        throw new MessageShardUnavailableError(
          "No message shards are available for message lookup",
        )
      }
      return null
    }

    for (const shardInfo of shards) {
      try {
        const found = await this.shardManager.withShardClientForRead(
          shardInfo.shard,
          async (shardClient) => {
            const [message] = await shardClient
              .select()
              .from(messageModel)
              .where(
                and(
                  eq(messageModel.id, id),
                  eq(messageModel.conversationId, conversationId),
                  eq(messageModel.workspaceId, workspaceId),
                  gte(messageModel.createdAt, sinceTime),
                ),
              )
              .limit(1)

            if (!message) {
              return null
            }

            const attachmentsByMessageId = await this.fetchAndGroupAttachments(
              shardClient,
              [message],
            )
            return {
              ...message,
              attachments: attachmentsByMessageId[message.id] ?? [],
            } as MessageWithAttachments
          },
        )
        if (found) {
          return found
        }
      } catch (error) {
        if (requireCompleteResults) {
          throw this.toStorageError("find message by id in conversation", error)
        }
        logger.warn(
          { err: error, shardId: shardInfo.shard.id },
          "Shard query failed in findByIdInConversation",
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
          return await this.shardManager.withShardClientForRead(
            shardInfo.shard,
            async (shardClient) => {
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
            },
          )
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

  async findManyBySourceIds({
    contactInboxIds,
    sourceIds,
    workspaceId,
    sinceTime,
  }: FindManyBySourceIdsParams): Promise<MessageSourceRow[]> {
    if (contactInboxIds.length === 0 || sourceIds.length === 0) {
      return []
    }
    if (!sinceTime) {
      throw new Error(
        "sinceTime is required for findManyBySourceIds in sharded repository",
      )
    }

    const shards = await this.getConversationReadShards(sinceTime, workspaceId)
    if (shards.length === 0) {
      return []
    }

    const shardResults = await Promise.all(
      shards.map(async (shardInfo): Promise<MessageSourceRow[]> => {
        try {
          return await this.shardManager.withShardClientForRead(
            shardInfo.shard,
            async (shardClient) =>
              (await shardClient
                .select({
                  id: messageModel.id,
                  conversationId: messageModel.conversationId,
                  contactInboxId: messageModel.contactInboxId,
                  sourceId: messageModel.sourceId,
                  createdAt: messageModel.createdAt,
                })
                .from(messageModel)
                .where(
                  and(
                    eq(messageModel.workspaceId, workspaceId),
                    inArray(messageModel.contactInboxId, contactInboxIds),
                    inArray(messageModel.sourceId, sourceIds),
                    gte(messageModel.createdAt, sinceTime),
                  ),
                )) as MessageSourceRow[],
          )
        } catch (error) {
          logger.warn(
            { err: error, shardId: shardInfo.shard.id },
            "Shard query failed in findManyBySourceIds",
          )
          return []
        }
      }),
    )

    return shardResults.flat()
  }

  async bulkPatchContentAttributes({
    patches,
    sinceTime,
    workspaceId,
  }: BulkPatchContentAttributesParams): Promise<void> {
    if (patches.length === 0) {
      return
    }
    if (!sinceTime) {
      throw new Error(
        "sinceTime is required for bulkPatchContentAttributes in sharded repository",
      )
    }

    const shards = await this.getConversationReadShards(sinceTime, workspaceId)
    if (shards.length === 0) {
      return
    }

    const mergeJsonb = (overlay: Record<string, unknown>) =>
      sql`COALESCE(${messageModel.contentAttributes}, '{}'::jsonb) || ${JSON.stringify(overlay)}::jsonb`

    await Promise.all(
      shards.map((shardInfo) =>
        withShardRetry(async () => {
          const shardClient = await this.shardManager.getShardClient(
            shardInfo.shard,
          )
          await shardClient.transaction(async (tx) => {
            for (const patch of patches) {
              await tx
                .update(messageModel)
                .set({
                  ...(patch.text === undefined ? {} : { text: patch.text }),
                  contentAttributes: mergeJsonb(patch.overlay),
                  updatedAt: new Date(),
                })
                .where(
                  and(
                    eq(messageModel.workspaceId, workspaceId),
                    eq(messageModel.contactInboxId, patch.contactInboxId),
                    eq(messageModel.sourceId, patch.sourceId),
                    gte(messageModel.createdAt, sinceTime),
                  ),
                )
            }
          })
        }),
      ),
    )
  }

  async findAttachmentById({
    id,
    workspaceId,
  }: FindAttachmentByIdParams): Promise<AttachmentLookupRow | null> {
    const selectAttachment = async (
      shardClient: MessageShardDatabaseClient,
    ) => {
      const [row] = await shardClient
        .select({
          id: attachmentModel.id,
          originPath: attachmentModel.originPath,
          mimeType: attachmentModel.mimeType,
          createdAt: attachmentModel.createdAt,
        })
        .from(attachmentModel)
        .where(
          and(
            eq(attachmentModel.id, id),
            eq(attachmentModel.workspaceId, workspaceId),
          ),
        )
        .limit(1)

      return (row as AttachmentLookupRow | undefined) ?? null
    }

    const writeShardResult = await withShardRetry(async () => {
      const shardClient = await this.shardManager.getShardForWrite(workspaceId)
      return selectAttachment(shardClient)
    })
    if (writeShardResult) {
      return writeShardResult
    }

    const fallbackSinceTime = new Date(
      Date.now() - ATTACHMENT_FALLBACK_LOOKBACK_MS,
    )
    fallbackSinceTime.setMinutes(0, 0, 0)
    const shards = await this.getConversationReadShards(
      fallbackSinceTime,
      workspaceId,
    )

    for (const shardInfo of shards) {
      try {
        const found = await this.shardManager.withShardClientForRead(
          shardInfo.shard,
          selectAttachment,
        )
        if (found) {
          return found
        }
      } catch (error) {
        logger.warn(
          { err: error, shardId: shardInfo.shard.id },
          "Shard query failed in findAttachmentById",
        )
      }
    }

    return null
  }

  async updateAttachment({
    id,
    workspaceId,
    createdAt,
    fields,
  }: UpdateAttachmentParams): Promise<void> {
    const shards = await this.getConversationReadShards(createdAt, workspaceId)
    if (shards.length === 0) {
      return
    }

    await Promise.all(
      shards.map((shardInfo) =>
        withShardRetry(async () => {
          const shardClient = await this.shardManager.getShardClient(
            shardInfo.shard,
          )
          await shardClient
            .update(attachmentModel)
            .set({
              ...fields,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(attachmentModel.id, id),
                eq(attachmentModel.workspaceId, workspaceId),
                eq(attachmentModel.createdAt, createdAt),
              ),
            )
        }),
      ),
    )
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

    let shards: MessageShardTimeRangeInfo[]
    try {
      shards = await this.getConversationReadShards(
        sinceTime,
        options?.workspaceId,
      )
    } catch (error) {
      if (options?.requireCompleteResults) {
        throw this.toStorageError(
          "select shards for last messages by conversation",
          error,
        )
      }
      logger.warn(
        { err: error },
        "Shard selection failed in findLastByConversation",
      )
      return []
    }
    if (shards.length === 0) {
      if (options?.requireCompleteResults) {
        throw new MessageShardUnavailableError(
          "No message shards are available for last-message read",
        )
      }
      return []
    }

    // Query all relevant shards in parallel and merge by recency
    const shardResults = await Promise.all(
      shards.map(async (shardInfo): Promise<MessageWithAttachments[]> => {
        try {
          return await this.shardManager.withShardClientForRead(
            shardInfo.shard,
            async (shardClient) => {
              const whereConditions = [
                eq(messageModel.conversationId, conversationId),
                gte(messageModel.createdAt, sinceTime),
              ]
              if (options?.workspaceId) {
                whereConditions.push(
                  eq(messageModel.workspaceId, options.workspaceId),
                )
              }

              if (options?.messageTypes && options.messageTypes.length > 0) {
                whereConditions.push(
                  inArray(messageModel.messageType, options.messageTypes),
                )
              }

              const messages = await shardClient
                .select()
                .from(messageModel)
                .where(and(...whereConditions))
                .orderBy(desc(messageModel.createdAt), desc(messageModel.id))
                .limit(limit)

              if (messages.length === 0) {
                return []
              }

              if (options?.withAttachments) {
                const attachmentsByMessageId =
                  await this.fetchAndGroupAttachments(shardClient, messages)
                return this.mapMessagesToWithAttachments(
                  messages as MessageModel[],
                  attachmentsByMessageId,
                )
              }

              if (options?.attachmentCountOnly) {
                const attachmentCountByMessageId =
                  await this.fetchAttachmentCounts(shardClient, messages)
                return this.mapMessagesToWithAttachmentCounts(
                  messages as MessageModel[],
                  attachmentCountByMessageId,
                )
              }

              return this.mapMessagesToWithAttachments(
                messages as MessageModel[],
                {},
              )
            },
          )
        } catch (error) {
          if (options?.requireCompleteResults) {
            throw this.toStorageError(
              "find last messages by conversation",
              error,
            )
          }
          logger.warn(
            { err: error, shardId: shardInfo.shard.id },
            "Shard query failed in findLastByConversation",
          )
          return []
        }
      }),
    )

    return shardResults.flat().sort(compareMessageDesc).slice(0, limit)
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

    let shards: MessageShardTimeRangeInfo[]
    try {
      shards = await this.getConversationReadShards(
        sinceTime,
        options.workspaceId,
      )
    } catch (error) {
      if (options.requireCompleteResults) {
        throw this.toStorageError(
          "select shards for messages by conversation",
          error,
        )
      }
      logger.warn(
        { err: error },
        "Shard selection failed in findManyByConversation",
      )
      return []
    }
    if (shards.length === 0) {
      if (options.requireCompleteResults) {
        throw new MessageShardUnavailableError(
          "No message shards are available for conversation read",
        )
      }
      return []
    }

    // Query all relevant shards in parallel and merge by recency
    const shardResults = await Promise.all(
      shards.map(async (shardInfo): Promise<MessageModel[]> => {
        try {
          return await this.shardManager.withShardClientForRead(
            shardInfo.shard,
            async (shardClient) => {
              const whereConditions = [
                eq(messageModel.conversationId, conversationId),
                gte(messageModel.createdAt, sinceTime),
              ]
              if (options.workspaceId) {
                whereConditions.push(
                  eq(messageModel.workspaceId, options.workspaceId),
                )
              }

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
                .orderBy(desc(messageModel.createdAt), desc(messageModel.id))
                .limit(options.limit)

              return messages as MessageModel[]
            },
          )
        } catch (error) {
          if (options.requireCompleteResults) {
            throw this.toStorageError("find messages by conversation", error)
          }
          logger.warn(
            { err: error, shardId: shardInfo.shard.id },
            "Shard query failed in findManyByConversation",
          )
          return []
        }
      }),
    )

    return shardResults.flat().sort(compareMessageDesc).slice(0, options.limit)
  }

  async findManyByIds(
    ids: string[],
    contactInboxId: string,
    sinceTime?: Date,
    workspaceId?: string,
  ): Promise<Pick<MessageModel, "id" | "text">[]> {
    if (ids.length === 0) {
      return []
    }

    if (!sinceTime) {
      throw new Error(
        "sinceTime is required for findManyByIds in sharded repository",
      )
    }

    const timeRangeShards = await this.getShardsForRange(sinceTime, new Date())
    const writeShard = workspaceId
      ? await this.shardManager.getWriteShardInfo(workspaceId)
      : null
    const shards = this.mergeWriteShard(timeRangeShards, writeShard)
    if (shards.length === 0) {
      return []
    }

    // Query all shards in parallel and deduplicate
    const shardResults = await Promise.all(
      shards.map(
        async (shardInfo): Promise<Pick<MessageModel, "id" | "text">[]> => {
          try {
            return await this.shardManager.withShardClientForRead(
              shardInfo.shard,
              async (shardClient) => {
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
              },
            )
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
    const timeRangeShards = await this.getShardsForRange(startTime, endTime)
    // Always include the workspace's write shard: historical-import rows are
    // back-dated into it and would otherwise fall outside the time window when
    // the conversation's newest message predates the shard's activation.
    const writeShard = await this.shardManager.getWriteShardInfo(
      query.workspaceId,
    )
    const allShards = this.mergeWriteShard(timeRangeShards, writeShard)

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

  private queryShardForMessages(
    shardInfo: MessageShardTimeRangeInfo,
    query: ListMessagesQuery,
    limit: number,
    cursor?: PaginationCursor,
  ): Promise<PaginatedMessages> {
    const { workspaceId, conversationId, contactInboxId } = query
    return this.shardManager.withShardClientForRead(
      shardInfo.shard,
      async (shardClient) => {
        const whereConditions = [eq(messageModel.workspaceId, workspaceId)]

        if (conversationId) {
          whereConditions.push(eq(messageModel.conversationId, conversationId))
        }

        if (contactInboxId) {
          whereConditions.push(eq(messageModel.contactInboxId, contactInboxId))
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
      },
    )
  }
}
