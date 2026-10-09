import { z } from "zod"

import {
  and,
  type DatabaseClient,
  db,
  desc,
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
  connectSessionTargetClaimSchema,
  connectSessionTargetSchema,
} from "../../partials/connect-session"
import {
  ACTIVE_CONNECT_SESSION_STATUSES,
  type ConnectSessionStatus,
} from "../../partials/connection"
import type { IntegrationType } from "../../partials/integration"
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
  targetClaims: z
    .record(z.string(), connectSessionTargetClaimSchema)
    .parse(session.targetClaims),
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

  /** The newest unexpired, in-flight session of a provider — how a settings page resumes after the OAuth round-trip. */
  async findLatestInFlightByProvider(
    input: { workspaceId: string; provider: IntegrationType },
    tx: DatabaseClient = db,
  ): Promise<ConnectSessionModel | undefined> {
    const [session] = await tx
      .select()
      .from(connectSessionModel)
      .where(
        and(
          eq(connectSessionModel.workspaceId, input.workspaceId),
          eq(connectSessionModel.provider, input.provider),
          inArray(connectSessionModel.status, ACTIVE_CONNECT_SESSION_STATUSES),
          sql`${connectSessionModel.expiresAt} > now()`,
        ),
      )
      .orderBy(desc(connectSessionModel.createdAt))
      .limit(1)
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
      workspaceId: string
      values:
        | (Partial<
            Pick<
              typeof connectSessionModel.$inferInsert,
              | "encryptedAuth"
              | "expiresAt"
              | "nextAction"
              | "returnUrl"
              | "status"
              | "step"
              | "targets"
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
          eq(connectSessionModel.workspaceId, input.workspaceId),
          inArray(connectSessionModel.status, input.statuses),
          expiryCondition,
        ),
      )
      .returning()
    return row ? parseConnectSession(row) : undefined
  },

  /**
   * Cancels a workspace's abandoned `pending` sessions of one provider — a
   * session still `pending` never got an OAuth callback (closed tab, failed
   * callback), so it only occupies the per-workspace cap. `authorized` and
   * `awaiting_selection` sessions are deliberately left alone: they hold a
   * user's in-progress authorization.
   */
  async cancelPendingByProvider(
    input: { workspaceId: string; provider: IntegrationType },
    tx: DatabaseClient = db,
  ): Promise<number> {
    const rows = await tx
      .update(connectSessionModel)
      .set({
        status: "cancelled",
        consumedAt: sql`now()`,
        encryptedAuth: null,
      })
      .where(
        and(
          eq(connectSessionModel.workspaceId, input.workspaceId),
          eq(connectSessionModel.provider, input.provider),
          eq(connectSessionModel.status, "pending"),
        ),
      )
      .returning({ id: connectSessionModel.id })
    return rows.length
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
   * Atomically acquires or replaces an expired target lease. The owner token
   * makes release conditional, so a failed attempt cannot clear a newer
   * claimant's lease.
   */
  async claimTarget(
    input: {
      id: string
      workspaceId: string
      targetId: string
      ownerToken: string
      leaseExpiresAt: Date
    },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const [row] = await tx
      .update(connectSessionModel)
      .set({
        targetClaims: sql`jsonb_set(
          ${connectSessionModel.targetClaims},
          ARRAY[${input.targetId}]::text[],
          jsonb_build_object(
            'ownerToken', ${input.ownerToken}::text,
            'expiresAt', ${input.leaseExpiresAt.toISOString()}::text
          )
        )`,
      })
      .where(
        and(
          eq(connectSessionModel.id, input.id),
          eq(connectSessionModel.workspaceId, input.workspaceId),
          eq(connectSessionModel.status, "awaiting_selection"),
          gt(connectSessionModel.expiresAt, sql`now()`),
          sql`(
            ${connectSessionModel.targetClaims} -> ${input.targetId} IS NULL
            OR (${connectSessionModel.targetClaims} -> ${input.targetId} ->> 'expiresAt')::timestamptz <= now()
          )`,
        ),
      )
      .returning({ id: connectSessionModel.id })
    return Boolean(row)
  },

  /** Releases only the caller's still-current target lease. */
  async releaseTarget(
    input: {
      id: string
      workspaceId: string
      targetId: string
      ownerToken: string
    },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(connectSessionModel)
      .set({
        targetClaims: sql`${connectSessionModel.targetClaims} - ${input.targetId}`,
      })
      .where(
        and(
          eq(connectSessionModel.id, input.id),
          eq(connectSessionModel.workspaceId, input.workspaceId),
          eq(connectSessionModel.status, "awaiting_selection"),
          gt(connectSessionModel.expiresAt, sql`now()`),
          sql`${connectSessionModel.targetClaims} -> ${input.targetId} ->> 'ownerToken' = ${input.ownerToken}`,
        ),
      )
  },

  /** Atomically merges outcomes and transitions a fully processed active session. */
  async appendResults(
    input: {
      id: string
      workspaceId: string
      results: ConnectSessionOutcome[]
      resultConnectionIds: string[]
    },
    tx: DatabaseClient = db,
  ): Promise<ConnectSessionModel | undefined> {
    const newResults = sql`${JSON.stringify(input.results)}::jsonb`
    const mergedResults = sql`(${connectSessionModel.results} || ${newResults})`
    const selectableTargetCount = sql`(SELECT count(*) FROM jsonb_array_elements(${connectSessionModel.targets}) AS t WHERE (t->>'selectable')::boolean)`
    // Only selectable targets with a durable connected/duplicated outcome
    // resolve the session. Failed and quota-limited attempts remain retryable.
    const selectableTargetIds = sql`(SELECT t->>'id' FROM jsonb_array_elements(${connectSessionModel.targets}) AS t WHERE (t->>'selectable')::boolean)`
    const distinctResolvedTargetCount = sql`(SELECT count(DISTINCT elem->>'targetId') FROM jsonb_array_elements(${mergedResults}) AS elem WHERE elem->>'targetId' IN ${selectableTargetIds} AND elem->>'status' IN ('connected', 'duplicated'))`
    const isComplete = sql`(${distinctResolvedTargetCount} >= ${selectableTargetCount})`

    const [row] = await tx
      .update(connectSessionModel)
      .set({
        results: mergedResults,
        resultConnectionIds: sql`array_cat(${connectSessionModel.resultConnectionIds}, ARRAY[${sql.join(
          input.resultConnectionIds.map((id) => sql`${id}`),
          sql`, `,
        )}]::text[])`,
        status: sql`CASE WHEN ${isComplete} THEN 'completed' ELSE ${connectSessionModel.status} END`,
        step: sql`CASE WHEN ${isComplete} THEN 'done' ELSE ${connectSessionModel.step} END`,
        consumedAt: sql`CASE WHEN ${isComplete} THEN now() ELSE ${connectSessionModel.consumedAt} END`,
        encryptedAuth: sql`CASE WHEN ${isComplete} THEN NULL ELSE ${connectSessionModel.encryptedAuth} END`,
      })
      .where(
        and(
          eq(connectSessionModel.id, input.id),
          eq(connectSessionModel.workspaceId, input.workspaceId),
          eq(connectSessionModel.status, "awaiting_selection"),
          gt(connectSessionModel.expiresAt, sql`now()`),
        ),
      )
      .returning()
    return row ? parseConnectSession(row) : undefined
  },

  /** Completes a one-target OAuth reconnect after its callback is claimed. */
  async completeReconnect(
    input: {
      id: string
      workspaceId: string
      result: ConnectSessionOutcome & { connectionId: string }
    },
    tx: DatabaseClient = db,
  ): Promise<ConnectSessionModel | undefined> {
    const [row] = await tx
      .update(connectSessionModel)
      .set({
        results: sql`(${connectSessionModel.results} || ${JSON.stringify([input.result])}::jsonb)`,
        resultConnectionIds: sql`array_append(${connectSessionModel.resultConnectionIds}, ${input.result.connectionId})`,
        status: "completed",
        step: "done",
        consumedAt: sql`now()`,
        encryptedAuth: null,
      })
      .where(
        and(
          eq(connectSessionModel.id, input.id),
          eq(connectSessionModel.workspaceId, input.workspaceId),
          eq(connectSessionModel.status, "authorized"),
          gt(connectSessionModel.expiresAt, sql`now()`),
        ),
      )
      .returning()
    return row ? parseConnectSession(row) : undefined
  },
}
