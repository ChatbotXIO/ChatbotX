import { createId } from "@chatbotx.io/utils"
import { logger } from "../../../logger"
import type { CreateMessageInput } from "../../../repositories/message/message-repository"
import { withShardRetry } from "../../shared/retry"

const PG_UNIQUE_VIOLATION = "23505"
const MESSAGE_PRIMARY_KEY_SUFFIX = "Message_pkey"

type PgErrorLike = Error & { code?: unknown; constraint?: unknown }

const asPgError = (value: unknown): PgErrorLike | undefined =>
  value instanceof Error ? (value as PgErrorLike) : undefined

/**
 * True when `error` (or the driver error drizzle wrapped in `cause`) is a
 * unique violation on the Message primary key `(id, createdAt)`. TimescaleDB
 * reports the chunk-level constraint (`1451_Message_pkey`), hence the suffix
 * match rather than an exact name.
 */
export function isMessagePrimaryKeyViolation(error: unknown): boolean {
  const candidates = [asPgError(error), asPgError(asPgError(error)?.cause)]
  return candidates.some(
    (candidate) =>
      candidate?.code === PG_UNIQUE_VIOLATION &&
      typeof candidate.constraint === "string" &&
      candidate.constraint.endsWith(MESSAGE_PRIMARY_KEY_SUFFIX),
  )
}

/**
 * Run a Message insert under {@link withShardRetry} and, if the very first
 * attempt fails only because another process minted the same snowflake id in
 * the same millisecond, redo it with a fresh id. The dedup arbiter
 * `(contactInboxId, sourceId, createdAt)` cannot absorb that failure — it is a
 * different message that happens to share the primary key — so without this
 * the whole job dies on a 1-in-a-million race.
 *
 * A primary-key violation that shows up only AFTER a transport retry is a
 * different animal: the first send may have committed before the connection
 * dropped, in which case the row on disk is this very message. Minting a
 * fresh id there would store it twice, so that error is surfaced unchanged,
 * exactly as before this helper existed.
 */
export function withPrimaryKeyCollisionRecovery<T>(
  message: CreateMessageInput,
  insertOnce: (message: CreateMessageInput) => Promise<T>,
): Promise<T> {
  let isFirstAttempt = true

  return withShardRetry(async () => {
    const attemptMessage = message
    const isCollisionRecoverable = isFirstAttempt
    isFirstAttempt = false
    try {
      return await insertOnce(attemptMessage)
    } catch (error) {
      if (!(isCollisionRecoverable && isMessagePrimaryKeyViolation(error))) {
        throw error
      }
      const retry = { ...attemptMessage, id: createId() }
      logger.warn(
        {
          err: error,
          collidingId: attemptMessage.id,
          retryId: retry.id,
          conversationId: attemptMessage.conversationId,
          sourceId: attemptMessage.sourceId,
          workspaceId: attemptMessage.workspaceId,
        },
        "Message primary key collision — retrying insert with a fresh id",
      )
      return await withShardRetry(() => insertOnce(retry))
    }
  })
}
