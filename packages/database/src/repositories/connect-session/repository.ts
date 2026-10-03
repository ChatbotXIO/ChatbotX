import {
  and,
  type DatabaseClient,
  db,
  eq,
  gt,
  inArray,
  lte,
  sql,
} from "../../client"
import {
  type ConnectSessionOutcome,
  connectSessionNextActionSchema,
  connectSessionOutcomeSchema,
  connectSessionTargetSchema,
} from "../../partials/connect-session"
import {
  ACTIVE_CONNECT_SESSION_STATUSES,
  type ConnectSessionStatus,
} from "../../partials/connection"
import { connectSessionModel } from "../../schema"
import type { ConnectSessionModel } from "../../types"
import { type ChunkedPurgeStopReason, chunkedPurge } from "../chunked-purge"

const parseConnectSession = (
  session: ConnectSessionModel,
): ConnectSessionModel => ({
  ...session,
  nextAction:
    session.nextAction === null
      ? null
      : connectSessionNextActionSchema.parse(session.nextAction),
  targets: connectSessionTargetSchema.array().parse(session.targets),
  results: connectSessionOutcomeSchema.array().parse(session.results),
})
export const connectSessionRepository = {
  async findByIdForWorkspace(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<ConnectSessionModel | undefined> {
    const session = await tx.query.connectSessionModel.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId },
    })
    return session ? parseConnectSession(session) : undefined
  },

  /** Internal lookup for a session whose workspace is established by the row. */
  async findById(
    input: { id: string },
    tx: DatabaseClient = db,
  ): Promise<ConnectSessionModel | undefined> {
    const session = await tx.query.connectSessionModel.findFirst({
      where: { id: input.id },
    })
    return session ? parseConnectSession(session) : undefined
  },

  /** OAuth callbacks resolve the globally unique nonce before workspace context exists. */
  async findByStateNonceHash(
    input: { stateNonceHash: string },
    tx: DatabaseClient = db,
  ): Promise<ConnectSessionModel | undefined> {
    const session = await tx.query.connectSessionModel.findFirst({
      where: { stateNonceHash: input.stateNonceHash },
    })
    return session ? parseConnectSession(session) : undefined
  },

  /** Counts unexpired, non-terminal sessions toward the workspace cap. */
  async countActiveByWorkspaceId(
    input: { workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<number> {
    return await tx.$count(
      connectSessionModel,
      and(
        eq(connectSessionModel.workspaceId, input.workspaceId),
        inArray(connectSessionModel.status, ACTIVE_CONNECT_SESSION_STATUSES),
        sql`${connectSessionModel.expiresAt} > now()`,
      ),
    )
  },

  async insert(
    values: typeof connectSessionModel.$inferInsert,
    tx: DatabaseClient = db,
  ): Promise<ConnectSessionModel> {
    const [row] = await tx
      .insert(connectSessionModel)
      .values(values)
      .returning()
    return parseConnectSession(row)
  },

  /**
   * Updates a session only while it is in one of the requested states.
   *
   * A transition into a terminal status must supply `consumedAt` and clear
   * `encryptedAuth` in the same call. This keeps the terminal-state check,
   * retention sweep, and ciphertext lifecycle atomic. The narrow active-state
   * shape avoids making identity, actor, and expiry fields mutable here.
   */
  async updateWhereStatusIn(
    input: {
      id: string
      values:
        | (Partial<
            Pick<
              typeof connectSessionModel.$inferInsert,
              "encryptedAuth" | "nextAction" | "status" | "step"
            >
          > & {
            status?: Exclude<
              ConnectSessionStatus,
              "completed" | "failed" | "expired" | "cancelled"
            >
          })
        | (Partial<
            Pick<
              typeof connectSessionModel.$inferInsert,
              "errorCode" | "nextAction" | "step"
            >
          > & {
            status: "completed" | "failed" | "expired" | "cancelled"
            consumedAt: Date
            encryptedAuth: null
          })
      statuses: ConnectSessionStatus[]
      requireUnexpired?: boolean
    },
    tx: DatabaseClient = db,
  ): Promise<ConnectSessionModel | undefined> {
    const expiryCondition = input.requireUnexpired
      ? gt(connectSessionModel.expiresAt, sql`now()`)
      : undefined
    const [row] = await tx
      .update(connectSessionModel)
      .set(input.values)
      .where(
        and(
          eq(connectSessionModel.id, input.id),
          inArray(connectSessionModel.status, input.statuses),
          expiryCondition,
        ),
      )
      .returning()
    return row ? parseConnectSession(row) : undefined
  },

  /** Expires due active sessions and clears authorization ciphertext in one update. */
  async expireDue(
    input: { before: Date; statuses: ConnectSessionStatus[] },
    tx: DatabaseClient = db,
  ): Promise<number> {
    const rows = await tx
      .update(connectSessionModel)
      .set({
        status: "expired",
        consumedAt: sql`now()`,
        encryptedAuth: null,
      })
      .where(
        and(
          inArray(connectSessionModel.status, input.statuses),
          lte(connectSessionModel.expiresAt, input.before),
        ),
      )
      .returning({ id: connectSessionModel.id })
    return rows.length
  },

  /**
   * Deletes terminal `ConnectSession` rows (`completed`/`failed`/
   * `expired`/`cancelled`, via `consumedAt` being set at all) past
   * `retentionDays` — the row otherwise never leaves the table once
   * terminal, unlike every other retention-swept table in this codebase.
   * Chunked, oldest first, via the shared `chunkedPurge` (see its
   * docstring for why: a single large `DELETE` would hold row locks for
   * its whole duration and block a concurrent `ConnectSession` insert).
   */
  purgeOldTerminal(options: {
    retentionDays: number
    chunkSize: number
    interChunkDelayMs: number
    maxChunks: number
    maxRunDurationMs?: number
  }): Promise<{ deleted: number; stopReason: ChunkedPurgeStopReason }> {
    const { retentionDays, ...bounds } = options
    return chunkedPurge({
      table: "ConnectSession",
      where: sql`"consumedAt" IS NOT NULL AND "consumedAt" < NOW() - make_interval(days => ${retentionDays})`,
      orderBy: "consumedAt",
      ...bounds,
    })
  },

  /**
   * Atomic claim of one target id into `claimedTargetIds` — the `WHERE NOT
   * (targetId = ANY(...))` clause makes this a compare-and-set at the DB
   * level, so two concurrent connection attempts racing on the same target
   * can never both win (the loser sees `claimTarget` return `false` and maps
   * that to a `duplicated` outcome instead of double-connecting).
   */
  async claimTarget(
    input: { id: string; workspaceId: string; targetId: string },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const [row] = await tx
      .update(connectSessionModel)
      .set({
        claimedTargetIds: sql`array_append(${connectSessionModel.claimedTargetIds}, ${input.targetId})`,
      })
      .where(
        and(
          eq(connectSessionModel.id, input.id),
          eq(connectSessionModel.workspaceId, input.workspaceId),
          eq(connectSessionModel.status, "awaiting_selection"),
          gt(connectSessionModel.expiresAt, sql`now()`),
          sql`NOT (${input.targetId} = ANY(${connectSessionModel.claimedTargetIds}))`,
        ),
      )
      .returning({ id: connectSessionModel.id })
    return Boolean(row)
  },

  /** Releases a claimed target after a connect attempt that did not succeed. */
  async releaseTarget(
    input: { id: string; workspaceId: string; targetId: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(connectSessionModel)
      .set({
        claimedTargetIds: sql`array_remove(${connectSessionModel.claimedTargetIds}, ${input.targetId})`,
      })
      .where(
        and(
          eq(connectSessionModel.id, input.id),
          eq(connectSessionModel.workspaceId, input.workspaceId),
          eq(connectSessionModel.status, "awaiting_selection"),
          gt(connectSessionModel.expiresAt, sql`now()`),
        ),
      )
  },

  /** Atomically merges outcomes and transitions a fully processed active session. */
  async appendResults(
    input: {
      id: string
      results: ConnectSessionOutcome[]
      resultConnectionIds: string[]
    },
    tx: DatabaseClient = db,
  ): Promise<ConnectSessionModel | undefined> {
    const newResults = sql`${JSON.stringify(input.results)}::jsonb`
    const mergedResults = sql`(${connectSessionModel.results} || ${newResults})`
    const selectableTargetCount = sql`(SELECT count(*) FROM jsonb_array_elements(${connectSessionModel.targets}) AS t WHERE (t->>'selectable')::boolean)`
    // Only selectable targets count toward completion or a successful batch.
    const selectableTargetIds = sql`(SELECT t->>'id' FROM jsonb_array_elements(${connectSessionModel.targets}) AS t WHERE (t->>'selectable')::boolean)`
    const distinctResultCount = sql`(SELECT count(DISTINCT elem->>'targetId') FROM jsonb_array_elements(${mergedResults}) AS elem WHERE elem->>'targetId' IN ${selectableTargetIds})`
    // A duplicated outcome is successful: a retry raced an already-created
    // connection, so its requested work is complete even without a new id.
    const hasSuccess = sql`(SELECT bool_or(elem2->>'status' NOT IN ('failed', 'limitReached')) FROM jsonb_array_elements(${mergedResults}) AS elem2 WHERE elem2->>'targetId' IN ${selectableTargetIds})`
    const allLimitReached = sql`(SELECT bool_and(elem2->>'status' = 'limitReached') FROM jsonb_array_elements(${mergedResults}) AS elem2 WHERE elem2->>'targetId' IN ${selectableTargetIds})`
    const isComplete = sql`(${distinctResultCount} >= ${selectableTargetCount})`

    const [row] = await tx
      .update(connectSessionModel)
      .set({
        results: mergedResults,
        resultConnectionIds: sql`array_cat(${connectSessionModel.resultConnectionIds}, ARRAY[${sql.join(
          input.resultConnectionIds.map((id) => sql`${id}`),
          sql`, `,
        )}]::text[])`,
        status: sql`CASE WHEN NOT ${isComplete} THEN ${connectSessionModel.status} WHEN ${hasSuccess} THEN 'completed' ELSE 'failed' END`,
        step: sql`CASE WHEN ${isComplete} THEN 'done' ELSE ${connectSessionModel.step} END`,
        consumedAt: sql`CASE WHEN ${isComplete} THEN now() ELSE ${connectSessionModel.consumedAt} END`,
        errorCode: sql`CASE WHEN ${isComplete} AND ${allLimitReached} THEN 'quota_exceeded' WHEN ${isComplete} AND NOT ${hasSuccess} THEN 'provider_error' ELSE ${connectSessionModel.errorCode} END`,
        encryptedAuth: sql`CASE WHEN ${isComplete} THEN NULL ELSE ${connectSessionModel.encryptedAuth} END`,
      })
      .where(
        and(
          eq(connectSessionModel.id, input.id),
          eq(connectSessionModel.status, "awaiting_selection"),
          gt(connectSessionModel.expiresAt, sql`now()`),
        ),
      )
      .returning()
    return row ? parseConnectSession(row) : undefined
  },
}
