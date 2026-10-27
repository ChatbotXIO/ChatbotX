import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  sql,
} from "@chatbotx.io/database/client"
import {
  pipelineItemAttachmentModel,
  pipelineItemCommentModel,
} from "@chatbotx.io/database/schema"
import type { PipelineItemCommentModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { newestFirstKeyset } from "./item-cursor"

export type PipelineCommentInsert = Omit<
  typeof pipelineItemCommentModel.$inferInsert,
  "id" | "createdAt" | "updatedAt"
>

export type PipelineItemCommentPage = {
  items: PipelineItemCommentModel[]
  nextCursor: string | null
}

/** An item's comments and attachments (the item rows live in `pipelineItemRepository`). */
export const pipelineItemContentRepository = {
  // Comments ----------------------------------------------------------------

  /**
   * Newest-first keyset page of an item's comments. The cursor reuses the
   * item cursor contract (`createdAt desc`, id tie-breaker, timestamp read as
   * text so microseconds survive), so a malformed one fails the same way.
   */
  async listComments(
    input: {
      workspaceId: string
      itemId: string
      limit: number
      cursor?: string
    },
    tx: DatabaseClient = db,
  ): Promise<PipelineItemCommentPage> {
    const keyset = newestFirstKeyset(
      {
        timestamp: pipelineItemCommentModel.createdAt,
        id: pipelineItemCommentModel.id,
      },
      input,
    )
    const rows = await tx
      .select({
        comment: pipelineItemCommentModel,
        timestampText: keyset.timestampText,
      })
      .from(pipelineItemCommentModel)
      .where(
        and(
          eq(pipelineItemCommentModel.workspaceId, input.workspaceId),
          eq(pipelineItemCommentModel.itemId, input.itemId),
          keyset.after,
        ),
      )
      .orderBy(...keyset.orderBy)
      .limit(keyset.fetchLimit)
    const page = keyset.page(rows, (row) => ({
      sortValue: row.timestampText,
      id: row.comment.id,
    }))
    return {
      items: page.rows.map((row) => row.comment),
      nextCursor: page.nextCursor,
    }
  },

  async countCommentsForItems(
    input: { workspaceId: string; itemIds: string[] },
    tx: DatabaseClient = db,
  ) {
    if (input.itemIds.length === 0) {
      return []
    }
    return await tx
      .select({
        itemId: pipelineItemCommentModel.itemId,
        count: sql<number>`count(*)::int`,
      })
      .from(pipelineItemCommentModel)
      .where(
        and(
          eq(pipelineItemCommentModel.workspaceId, input.workspaceId),
          inArray(pipelineItemCommentModel.itemId, input.itemIds),
        ),
      )
      .groupBy(pipelineItemCommentModel.itemId)
  },

  /**
   * Inserts the comment, or returns the one an earlier call with the same
   * idempotency key stored. Only that key's conflict is absorbed.
   */
  async insertCommentIdempotent(
    values: PipelineCommentInsert,
    tx: DatabaseClient,
  ) {
    const insert = tx
      .insert(pipelineItemCommentModel)
      .values({ id: createId(), ...values })
    if (!values.idempotencyKey) {
      const [row] = await insert.returning()
      if (!row) {
        throw new Error("Failed to insert pipeline comment")
      }
      return { row, inserted: true as const }
    }
    const [row] = await insert
      .onConflictDoNothing({
        target: [
          pipelineItemCommentModel.workspaceId,
          pipelineItemCommentModel.itemId,
          pipelineItemCommentModel.idempotencyKey,
        ],
        where: sql`"idempotencyKey" IS NOT NULL`,
      })
      .returning()
    if (row) {
      return { row, inserted: true as const }
    }
    const existing = await tx.query.pipelineItemCommentModel.findFirst({
      where: {
        workspaceId: values.workspaceId,
        itemId: values.itemId,
        idempotencyKey: values.idempotencyKey,
      },
    })
    if (!existing) {
      throw new Error("Pipeline comment idempotency conflict without a row")
    }
    return { row: existing, inserted: false as const }
  },

  async deleteComment(
    input: { workspaceId: string; itemId: string; id: string },
    tx: DatabaseClient,
  ) {
    const rows = await tx
      .delete(pipelineItemCommentModel)
      .where(
        and(
          eq(pipelineItemCommentModel.workspaceId, input.workspaceId),
          eq(pipelineItemCommentModel.itemId, input.itemId),
          eq(pipelineItemCommentModel.id, input.id),
        ),
      )
      .returning({ id: pipelineItemCommentModel.id })
    return rows.length > 0
  },

  /** Latest remaining comment time, or null when the item has none. */
  async latestCommentAt(
    input: { workspaceId: string; itemId: string },
    tx: DatabaseClient,
  ) {
    const [row] = await tx
      .select({
        latest: sql<Date | null>`max(${pipelineItemCommentModel.createdAt})`,
      })
      .from(pipelineItemCommentModel)
      .where(
        and(
          eq(pipelineItemCommentModel.workspaceId, input.workspaceId),
          eq(pipelineItemCommentModel.itemId, input.itemId),
        ),
      )
    return row?.latest ?? null
  },

  // Attachments -------------------------------------------------------------

  async listAttachments(
    input: { workspaceId: string; itemId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.pipelineItemAttachmentModel.findMany({
      where: { workspaceId: input.workspaceId, itemId: input.itemId },
      with: { mediaLibraryFile: true },
      orderBy: { createdAt: "asc" },
    })
  },

  async countAttachments(
    input: { workspaceId: string; itemId: string },
    tx: DatabaseClient,
  ): Promise<number> {
    const [row] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(pipelineItemAttachmentModel)
      .where(
        and(
          eq(pipelineItemAttachmentModel.workspaceId, input.workspaceId),
          eq(pipelineItemAttachmentModel.itemId, input.itemId),
        ),
      )
    return row?.count ?? 0
  },

  async insertAttachments(
    input: {
      workspaceId: string
      itemId: string
      mediaLibraryFileIds: string[]
    },
    tx: DatabaseClient,
  ): Promise<number> {
    if (input.mediaLibraryFileIds.length === 0) {
      return 0
    }
    const rows = await tx
      .insert(pipelineItemAttachmentModel)
      .values(
        input.mediaLibraryFileIds.map((mediaLibraryFileId) => ({
          id: createId(),
          workspaceId: input.workspaceId,
          itemId: input.itemId,
          mediaLibraryFileId,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: pipelineItemAttachmentModel.id })
    return rows.length
  },

  async deleteAttachment(
    input: { workspaceId: string; itemId: string; mediaLibraryFileId: string },
    tx: DatabaseClient,
  ) {
    const rows = await tx
      .delete(pipelineItemAttachmentModel)
      .where(
        and(
          eq(pipelineItemAttachmentModel.workspaceId, input.workspaceId),
          eq(pipelineItemAttachmentModel.itemId, input.itemId),
          eq(
            pipelineItemAttachmentModel.mediaLibraryFileId,
            input.mediaLibraryFileId,
          ),
        ),
      )
      .returning({ id: pipelineItemAttachmentModel.id })
    return rows.length > 0
  },
}
