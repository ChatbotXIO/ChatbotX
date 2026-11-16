import type { Context } from "@chatbotx.io/sdk"
import { sha256Hex } from "@chatbotx.io/utils/crypto"
import { z } from "zod"
import { logger } from "../../../lib/logger"
import type { LineAuthValue } from "../../../schema"

/**
 * How long a multi-batch send's progress survives a failed batch. The chat
 * queue retries a failed send once, after an exponential backoff starting at
 * 5 s (`defaultJobOptions` in `@chatbotx.io/worker-config`), so 10 minutes
 * comfortably covers the retry while keeping stale progress short-lived.
 */
export const SEND_CHECKPOINT_TTL_SECONDS = 600

/** Progress of a multi-batch send that failed part-way through. */
export type SendCheckpoint = {
  /** Batches already delivered, counted from the first. */
  completedBatches: number
  messageIds: string[]
  sentCount: number
}

const checkpointSchema = z.object({
  completedBatches: z.number().int().positive(),
  messageIds: z.array(z.string()),
  sentCount: z.number().int().nonnegative(),
})

/**
 * The checkpoint key for one send: the recipient, the send's own id (the
 * outgoing `Message` row, which a queue retry reuses) and a SHA-256 of the
 * exact message objects. The id is what keeps a *new* send of the same content
 * from resuming a dead send's progress; the hash guards a retry whose content
 * changed. Uses Web Crypto rather than `node:crypto` to stay Edge-safe
 * (AGENTS.md invariant 25). Returns null when hashing fails; the send then
 * runs without a checkpoint.
 */
export const sendCheckpointKey = async (
  to: string,
  sendId: string,
  messages: unknown[],
): Promise<string | null> => {
  try {
    return `send-checkpoint:${to}:${sendId}:${await sha256Hex(JSON.stringify(messages))}`
  } catch (error) {
    logger.warn({ err: error }, "LINE send checkpoint key failed; no resume")
    return null
  }
}

/**
 * Takes (and so deletes) the checkpoint for `key`. Returns null when there is
 * none, when it does not fit a send of `batchCount` batches, or when the store
 * fails — the send then starts from the first batch, as it would without one.
 */
export const takeSendCheckpoint = async (
  ctx: Context<LineAuthValue>,
  key: string,
  batchCount: number,
  batchSize: number,
): Promise<SendCheckpoint | null> => {
  let raw: string | null
  try {
    raw = (await ctx.ephemeral?.take(key)) ?? null
  } catch (error) {
    // Resending from the first batch can duplicate, but a Redis hiccup must
    // not fail the send.
    logger.warn({ err: error }, "LINE send checkpoint lookup failed; resending")
    return null
  }
  if (raw === null) {
    return null
  }

  const checkpoint = parseCheckpoint(raw)
  // Every batch before the last is full, so a valid checkpoint covers whole
  // batches and leaves at least one still to send.
  if (
    !checkpoint ||
    checkpoint.completedBatches >= batchCount ||
    checkpoint.sentCount !== checkpoint.completedBatches * batchSize
  ) {
    logger.warn({ key }, "LINE send checkpoint is invalid; ignoring it")
    return null
  }
  return checkpoint
}

/** Stores the progress of a send whose next batch failed. Never throws. */
export const putSendCheckpoint = async (
  ctx: Context<LineAuthValue>,
  key: string,
  checkpoint: SendCheckpoint,
): Promise<void> => {
  try {
    await ctx.ephemeral?.put(
      key,
      JSON.stringify(checkpoint),
      SEND_CHECKPOINT_TTL_SECONDS,
    )
  } catch (error) {
    // The original send error still propagates; its retry just resends all.
    logger.warn({ err: error }, "LINE send checkpoint save failed")
  }
}

const parseCheckpoint = (raw: string): SendCheckpoint | null => {
  try {
    const parsed = checkpointSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
