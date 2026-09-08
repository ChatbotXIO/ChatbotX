import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  isNull,
  sql,
} from "../../client"
import { whatsappCoexistStagingModel } from "../../schema"
import type { WhatsappCoexistStagingModel } from "../../types"
import { type ChunkedPurgeStopReason, chunkedPurge } from "../chunked-purge"

export type PurgeProcessedCoexistStagingOptions = {
  retentionHours: number
  chunkSize: number
  interChunkDelayMs: number
  maxChunks: number
  maxRunDurationMs?: number
}

export type PurgeParseFailedCoexistStagingOptions = {
  retentionDays: number
  chunkSize: number
  interChunkDelayMs: number
  maxChunks: number
  maxRunDurationMs?: number
}

/**
 * Rows a flush should still pick up: neither imported (`processedAt`) nor
 * parked as unparseable (`parseFailedAt`). One predicate, used by the batch
 * query AND the post-drain tail re-check, so a poison row can never keep a run
 * alive forever by looking like outstanding work.
 */
const pendingFilter = (phoneNumberId: string) =>
  and(
    eq(whatsappCoexistStagingModel.phoneNumberId, phoneNumberId),
    isNull(whatsappCoexistStagingModel.processedAt),
    isNull(whatsappCoexistStagingModel.parseFailedAt),
  )

export const whatsappCoexistStagingRepository = {
  /**
   * Oldest-first page of staging rows still awaiting import for one phone
   * number. Always bounded by `limit` — the flush drains in chunks, and the
   * tail re-check asks for a single row.
   */
  async listPending(
    input: { phoneNumberId: string; limit: number },
    tx: DatabaseClient = db,
  ): Promise<WhatsappCoexistStagingModel[]> {
    return await tx
      .select()
      .from(whatsappCoexistStagingModel)
      .where(pendingFilter(input.phoneNumberId))
      .orderBy(whatsappCoexistStagingModel.id)
      .limit(input.limit)
  },

  /** Marks rows this flush imported. No-op for an empty list. */
  async markProcessed(
    input: { ids: string[] },
    tx: DatabaseClient = db,
  ): Promise<void> {
    if (input.ids.length === 0) {
      return
    }
    await tx
      .update(whatsappCoexistStagingModel)
      .set({ processedAt: new Date() })
      .where(inArray(whatsappCoexistStagingModel.id, input.ids))
  },

  /**
   * Parks staging rows the flush could not parse. Deliberately NOT
   * `processedAt`: nothing was imported from them, they must stay out of every
   * batch query, and they are kept for a week so the payload can be inspected
   * after a Meta schema change.
   */
  async markParseFailed(
    input: { ids: string[] },
    tx: DatabaseClient = db,
  ): Promise<void> {
    if (input.ids.length === 0) {
      return
    }
    await tx
      .update(whatsappCoexistStagingModel)
      .set({ parseFailedAt: new Date() })
      .where(inArray(whatsappCoexistStagingModel.id, input.ids))
  },

  /**
   * Deletes already-processed rows older than the retention window, oldest
   * first, in chunks so a long delete never blocks the flush that is still
   * writing to the table.
   */
  purgeProcessed(
    options: PurgeProcessedCoexistStagingOptions,
  ): Promise<{ deleted: number; stopReason: ChunkedPurgeStopReason }> {
    const { retentionHours, ...bounds } = options
    return chunkedPurge({
      table: "WhatsappCoexistStaging",
      where: sql`"processedAt" IS NOT NULL
          AND "processedAt" < NOW() - make_interval(hours => ${retentionHours})`,
      orderBy: "processedAt",
      ...bounds,
    })
  },

  /**
   * Deletes rows the flush could not parse, once they are old enough that
   * nobody is going to inspect the payload any more. They are never
   * `processedAt`, so `purgeProcessed` skips them and they would otherwise
   * accumulate forever.
   */
  purgeParseFailed(
    options: PurgeParseFailedCoexistStagingOptions,
  ): Promise<{ deleted: number; stopReason: ChunkedPurgeStopReason }> {
    const { retentionDays, ...bounds } = options
    return chunkedPurge({
      table: "WhatsappCoexistStaging",
      where: sql`"parseFailedAt" IS NOT NULL
          AND "parseFailedAt" < NOW() - make_interval(days => ${retentionDays})`,
      orderBy: "parseFailedAt",
      ...bounds,
    })
  },
}
