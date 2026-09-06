import { type DatabaseClient, db, eq, sql } from "../../client"
import { whatsappCoexistStagingModel } from "../../schema"
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
  async deleteByPhoneNumberId(
    input: { phoneNumberId: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .delete(whatsappCoexistStagingModel)
      .where(eq(whatsappCoexistStagingModel.phoneNumberId, input.phoneNumberId))
  },
}
