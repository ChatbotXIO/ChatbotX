import { type DatabaseClient, db, sql } from "@chatbotx.io/database/client"
import { WorkspacePurgeIncompleteError } from "../errors"
import { logger } from "../logger"

const PURGE_LOCK_TIMEOUT = "2s"
const PURGE_STATEMENT_TIMEOUT = "30s"

const getPostgresErrorCode = (value: unknown): unknown => {
  if (typeof value !== "object" || value === null || !("code" in value)) {
    return
  }
  return value.code
}

export const isPurgeTimeoutError = (err: unknown): boolean => {
  const code =
    getPostgresErrorCode(err) ??
    getPostgresErrorCode(err instanceof Error ? err.cause : undefined)
  return code === "55P03" || code === "57014"
}

export const pause = (ms: number): Promise<void> => {
  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, ms)
  return promise
}

export const assertPurgeDeadline = (
  deadlineAt: number,
  workspaceId: string,
  table: string,
): void => {
  if (Date.now() >= deadlineAt) {
    throw new WorkspacePurgeIncompleteError(workspaceId, table)
  }
}

export const withPurgeTimeouts = async <T>(props: {
  fn: (tx: DatabaseClient) => Promise<T>
  rethrowTimeout?: boolean
  table: string
  workspaceId: string
}): Promise<T> => {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`SET LOCAL lock_timeout = ${sql.raw(`'${PURGE_LOCK_TIMEOUT}'`)}`,
      )
      await tx.execute(
        sql`SET LOCAL statement_timeout = ${sql.raw(`'${PURGE_STATEMENT_TIMEOUT}'`)}`,
      )
      return await props.fn(tx)
    })
  } catch (err) {
    if (!isPurgeTimeoutError(err) || props.rethrowTimeout) {
      throw err
    }
    logger.info(
      { table: props.table, workspaceId: props.workspaceId },
      "workspace-purge: timed out, deferring to next run",
    )
    throw new WorkspacePurgeIncompleteError(props.workspaceId, props.table)
  }
}

type BatchResult<T> = {
  count: number
  value: T
}

export const drainInBatches = async <T>(props: {
  afterBatch?: (value: T) => Promise<void>
  batchSize: number
  deadlineAt: number
  maxBatches: number
  runBatch: (tx: DatabaseClient) => Promise<BatchResult<T>>
  table: string
  workspaceId: string
}): Promise<number> => {
  let total = 0

  for (let batch = 0; batch < props.maxBatches; batch += 1) {
    assertPurgeDeadline(props.deadlineAt, props.workspaceId, props.table)
    const result = await withPurgeTimeouts({
      fn: props.runBatch,
      table: props.table,
      workspaceId: props.workspaceId,
    })
    total += result.count

    if (result.count === 0) {
      return total
    }

    await props.afterBatch?.(result.value)

    if (result.count < props.batchSize) {
      return total
    }
  }

  throw new WorkspacePurgeIncompleteError(props.workspaceId, props.table)
}
