import { createId } from "@chatbotx.io/utils"
import { logger } from "../../../logger"
import type { CreateMessageInput } from "../../../repositories/message/message-repository"

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
 * Run a Message insert and, if it fails only because another process minted
 * the same snowflake id in the same millisecond, retry exactly once with a
 * fresh id. The dedup arbiter `(contactInboxId, sourceId, createdAt)` cannot
 * absorb that failure — it is a different message that happens to share the
 * primary key — so without this the whole job dies on a 1-in-a-million race.
 * Every other error is rethrown untouched.
 */
export async function withFreshIdOnPrimaryKeyCollision<T>(
  message: CreateMessageInput,
  run: (message: CreateMessageInput) => Promise<T>,
): Promise<T> {
  try {
    return await run(message)
  } catch (error) {
    if (!isMessagePrimaryKeyViolation(error)) {
      throw error
    }
    const retry = { ...message, id: createId() }
    logger.warn(
      {
        err: error,
        collidingId: message.id,
        retryId: retry.id,
        conversationId: message.conversationId,
        sourceId: message.sourceId,
        workspaceId: message.workspaceId,
      },
      "Message primary key collision — retrying insert with a fresh id",
    )
    return await run(retry)
  }
}
