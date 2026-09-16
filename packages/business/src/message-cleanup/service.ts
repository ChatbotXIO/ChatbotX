import {
  and,
  asc,
  type DatabaseClient,
  db,
  eq,
  inArray,
  liftDecompressionLimit,
  lte,
  sql,
} from "@chatbotx.io/database/client"
import { messageCleanupStatuses } from "@chatbotx.io/database/partials"
import {
  attachmentModel,
  messageCleanupModel,
  messageModel,
} from "@chatbotx.io/database/schema"
import type { MessageCleanupModel } from "@chatbotx.io/database/types"
import { uploader } from "@chatbotx.io/filesystem"
import { BaseService } from "../base.service"
import { logger } from "../logger"
import { messageService } from "../message/service"

export type MessageCleanupEntry = {
  contactId: string
  contactInboxId: string
  inboxId: string
  sourceId: string
  conversationIds: string[]
  sinceTime: Date
}

// Concurrent multi-row upserts/deletes on the same unique key must lock rows
// in a consistent order, or overlapping batches can deadlock.
const byInboxSourceKey = (
  a: { inboxId: string; sourceId: string },
  b: { inboxId: string; sourceId: string },
): number =>
  a.inboxId.localeCompare(b.inboxId) || a.sourceId.localeCompare(b.sourceId)

const PROCESS_DEFAULT_LIMIT = 100
const CONVERSATION_DELETE_BATCH_SIZE = 100
const ORPHANED_ATTACHMENT_BATCH_SIZE = 1000

/**
 * Tracks Message/Attachment rows orphaned by contact deletes.
 *
 * Message/Attachment are compressed TimescaleDB hypertables with no FKs, so a
 * contact delete leaves their rows behind and records one tombstone per
 * deleted contact-inbox here. The actual purge (`processPending`) is
 * implemented but intentionally not wired to any queue or cron yet.
 */
class MessageCleanupService extends BaseService {
  /**
   * Upserts one tombstone per deleted contact-inbox. Must run in the same
   * transaction as the contact delete so tombstones and deletes can never
   * diverge. Re-deleting a re-created contact updates the existing
   * `(inboxId, sourceId)` row: conversation ids are merged, the time window is
   * widened, and the row is reset to `pending`.
   */
  async record(props: {
    workspaceId: string
    entries: MessageCleanupEntry[]
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, entries, tx = db } = props
    if (entries.length === 0) {
      return
    }

    await tx
      .insert(messageCleanupModel)
      .values(
        [...entries].sort(byInboxSourceKey).map((entry) => ({
          workspaceId,
          contactId: entry.contactId,
          contactInboxId: entry.contactInboxId,
          inboxId: entry.inboxId,
          sourceId: entry.sourceId,
          conversationIds: entry.conversationIds,
          sinceTime: entry.sinceTime,
        })),
      )
      .onConflictDoUpdate({
        target: [messageCleanupModel.inboxId, messageCleanupModel.sourceId],
        set: {
          contactId: sql`excluded."contactId"`,
          contactInboxId: sql`excluded."contactInboxId"`,
          conversationIds: sql`(
            select coalesce(jsonb_agg(distinct value), '[]'::jsonb)
            from jsonb_array_elements_text(
              ${messageCleanupModel.conversationIds} || excluded."conversationIds"
            )
          )`,
          sinceTime: sql`least(${messageCleanupModel.sinceTime}, excluded."sinceTime")`,
          deletedAt: sql`now()`,
          status: messageCleanupStatuses.enum.pending,
          attempts: 0,
          lastError: null,
          processedAt: null,
          updatedAt: sql`now()`,
        },
      })
  }

  /**
   * Cancels pending cleanups for contacts that were re-created (same inbox +
   * platform sourceId), so the returning contact keeps their old history. Call
   * from every code path that inserts a `ContactInbox`, inside the same
   * transaction when one is available.
   */
  async cancelByInboxSource(props: {
    inboxId: string
    sourceIds: string[]
    tx?: DatabaseClient
  }): Promise<void> {
    const { inboxId, sourceIds, tx = db } = props
    if (sourceIds.length === 0) {
      return
    }

    await tx
      .delete(messageCleanupModel)
      .where(
        and(
          eq(messageCleanupModel.inboxId, inboxId),
          inArray(messageCleanupModel.sourceId, [...sourceIds].sort()),
        ),
      )
  }

  /**
   * Purges the orphaned messages/attachments recorded by `record`.
   *
   * NOT WIRED YET — no queue, cron, or caller invokes this on purpose; it will
   * be scheduled by an upcoming feature. Kept implemented (and unit-testable)
   * so the wiring change stays trivial.
   */
  async processPending(props?: { limit?: number }): Promise<{
    processed: number
    failed: number
  }> {
    const limit = props?.limit ?? PROCESS_DEFAULT_LIMIT

    // Claim rows first so concurrent processors never double-purge.
    const claimed = await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(messageCleanupModel)
        .where(eq(messageCleanupModel.status, "pending"))
        .orderBy(asc(messageCleanupModel.createdAt))
        .limit(limit)
        .for("update", { skipLocked: true })

      if (rows.length === 0) {
        return []
      }

      await tx
        .update(messageCleanupModel)
        .set({ status: messageCleanupStatuses.enum.processing })
        .where(
          inArray(
            messageCleanupModel.id,
            rows.map((row) => row.id),
          ),
        )

      return rows
    })

    let processed = 0
    let failed = 0
    for (const row of claimed) {
      try {
        await this.purgeRow(row)
        await db
          .update(messageCleanupModel)
          .set({
            status: messageCleanupStatuses.enum.completed,
            processedAt: new Date(),
            lastError: null,
          })
          .where(eq(messageCleanupModel.id, row.id))
        processed += 1
      } catch (error) {
        failed += 1
        logger.error(
          {
            err: error,
            messageCleanupId: row.id,
            workspaceId: row.workspaceId,
          },
          "Message cleanup purge failed",
        )
        await db
          .update(messageCleanupModel)
          .set({
            status: messageCleanupStatuses.enum.failed,
            attempts: row.attempts + 1,
            lastError: error instanceof Error ? error.message : String(error),
          })
          .where(eq(messageCleanupModel.id, row.id))
      }
    }

    return { processed, failed }
  }

  /**
   * Deletes one bounded batch of attachments whose parent Message no longer
   * exists. Attachment cannot have an FK to the Message hypertable, so this
   * reconciles rows left behind by deletes outside the contact tombstone flow.
   */
  async purgeOrphanedAttachments(props?: { limit?: number }): Promise<number> {
    const limit = props?.limit ?? ORPHANED_ATTACHMENT_BATCH_SIZE
    const result = await db.transaction(async (tx) => {
      await liftDecompressionLimit(tx)

      return tx.execute<{
        originPath: string
        thumbnailPath: string | null
      }>(sql`
        WITH orphaned AS (
          SELECT attachment."id", attachment."createdAt"
          FROM "Attachment" AS attachment
          WHERE NOT EXISTS (
            SELECT 1
            FROM "Message" AS message
            WHERE message."id" = attachment."messageId"
              AND message."createdAt" = attachment."messageCreatedAt"
          )
          ORDER BY attachment."createdAt" ASC
          LIMIT ${limit}
        )
        DELETE FROM "Attachment" AS attachment
        USING orphaned
        WHERE attachment."id" = orphaned."id"
          AND attachment."createdAt" = orphaned."createdAt"
        RETURNING attachment."originPath", attachment."thumbnailPath"
      `)
    })

    const deleteResults = await Promise.allSettled(
      result.rows
        .flatMap((attachment) =>
          attachment.thumbnailPath
            ? [attachment.originPath, attachment.thumbnailPath]
            : [attachment.originPath],
        )
        .map((path) => uploader.deleteObject(path)),
    )
    for (const deleteResult of deleteResults) {
      if (deleteResult.status === "rejected") {
        logger.warn(
          { err: deleteResult.reason },
          "Orphaned attachment file deletion failed",
        )
      }
    }

    return result.rows.length
  }

  private async purgeRow(row: MessageCleanupModel): Promise<void> {
    const attachmentPaths: string[] = []

    // Main-DB hypertables: bound every statement by conversationId (the
    // compression segmentby column) and by the delete moment, so a re-created
    // contact's newer rows can never be swept up. `liftDecompressionLimit`
    // clears the TimescaleDB decompression cap for each transaction only.
    for (
      let i = 0;
      i < row.conversationIds.length;
      i += CONVERSATION_DELETE_BATCH_SIZE
    ) {
      const batch = row.conversationIds.slice(
        i,
        i + CONVERSATION_DELETE_BATCH_SIZE,
      )
      await db.transaction(async (tx) => {
        await liftDecompressionLimit(tx)

        const attachments = await tx
          .select({
            originPath: attachmentModel.originPath,
            thumbnailPath: attachmentModel.thumbnailPath,
          })
          .from(attachmentModel)
          .where(
            and(
              inArray(attachmentModel.conversationId, batch),
              lte(attachmentModel.createdAt, row.deletedAt),
            ),
          )
        for (const attachment of attachments) {
          attachmentPaths.push(attachment.originPath)
          if (attachment.thumbnailPath) {
            attachmentPaths.push(attachment.thumbnailPath)
          }
        }

        await tx
          .delete(messageModel)
          .where(
            and(
              inArray(messageModel.conversationId, batch),
              lte(messageModel.createdAt, row.deletedAt),
            ),
          )
        await tx
          .delete(attachmentModel)
          .where(
            and(
              inArray(attachmentModel.conversationId, batch),
              lte(attachmentModel.createdAt, row.deletedAt),
            ),
          )
      })
    }

    // Shard DBs: the deleted contact-inbox id can never be re-assigned, so the
    // sinceTime lower bound is enough.
    const shardResult = await messageService.hardDeleteAllByContactInbox({
      contactInboxId: row.contactInboxId,
      sinceTime: row.sinceTime ?? row.createdAt,
      workspaceId: row.workspaceId,
    })
    attachmentPaths.push(...shardResult.attachmentPaths)

    const deleteResults = await Promise.allSettled(
      attachmentPaths.map((path) => uploader.deleteObject(path)),
    )
    for (const result of deleteResults) {
      if (result.status === "rejected") {
        logger.warn(
          { err: result.reason, messageCleanupId: row.id },
          "Message cleanup attachment file deletion failed",
        )
      }
    }
  }
}

export const messageCleanupService = new MessageCleanupService()
