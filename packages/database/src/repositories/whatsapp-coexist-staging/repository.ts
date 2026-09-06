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

/**
 * Deletes already-processed `WhatsappCoexistStaging` rows older than the
 * retention window, oldest first, in chunks so a long delete never blocks the
 * flush that is still writing to the table.
 */
export function purgeProcessedCoexistStaging(
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
}

export const whatsappCoexistStagingRepository = {
  /** Idempotent staging insert keyed on `(phoneNumberId, payloadHash)` — keep untargeted `onConflictDoNothing()`. */
  async stagePayload(
    props: {
      id: string
      phoneNumberId: string
      payload: unknown
      payloadHash: string
    },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .insert(whatsappCoexistStagingModel)
      .values(props)
      .onConflictDoNothing()
  },

  /** Next unprocessed batch, oldest first (keep `orderBy(id)`). */
  listUnprocessed(
    props: { phoneNumberId: string; limit: number },
    tx: DatabaseClient = db,
  ): Promise<WhatsappCoexistStagingModel[]> {
    return tx
      .select()
      .from(whatsappCoexistStagingModel)
      .where(
        and(
          eq(whatsappCoexistStagingModel.phoneNumberId, props.phoneNumberId),
          isNull(whatsappCoexistStagingModel.processedAt),
        ),
      )
      .orderBy(whatsappCoexistStagingModel.id)
      .limit(props.limit)
  },

  /** Mark a batch of staging rows processed. */
  async markProcessed(
    props: { ids: string[] },
    tx: DatabaseClient = db,
  ): Promise<void> {
    if (props.ids.length === 0) {
      return
    }
    await tx
      .update(whatsappCoexistStagingModel)
      .set({ processedAt: new Date() })
      .where(inArray(whatsappCoexistStagingModel.id, props.ids))
  },

  /** Any late-staged unprocessed row for this phone number id? (keep `limit(1)`). */
  async hasUnprocessed(
    props: { phoneNumberId: string },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const [row] = await tx
      .select({ id: whatsappCoexistStagingModel.id })
      .from(whatsappCoexistStagingModel)
      .where(
        and(
          eq(whatsappCoexistStagingModel.phoneNumberId, props.phoneNumberId),
          isNull(whatsappCoexistStagingModel.processedAt),
        ),
      )
      .limit(1)
    return Boolean(row)
  },
}
