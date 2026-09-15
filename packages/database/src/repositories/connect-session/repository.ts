import { and, type DatabaseClient, db, eq, sql } from "../../client"
import type { ConnectSessionStatus } from "../../partials/connection"
import { connectSessionModel } from "../../schema"
import type { ConnectSessionModel } from "../../types"

export const connectSessionRepository = {
  async findByIdForWorkspace(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<ConnectSessionModel | undefined> {
    return await tx.query.connectSessionModel.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId },
    })
  },

  /**
   * Unscoped lookup by primary key — for internal service methods
   * (`attachAuthorization`, `claimTarget`, `recordResults`, …) operating on
   * a session already resolved via `findByNonce` earlier in the same flow,
   * where the caller has no independently-verified `workspaceId` to scope
   * by (the session row itself IS the source of truth for which workspace
   * it belongs to).
   */
  async findById(
    input: { id: string },
    tx: DatabaseClient = db,
  ): Promise<ConnectSessionModel | undefined> {
    return await tx.query.connectSessionModel.findFirst({
      where: { id: input.id },
    })
  },

  /** `stateNonceHash` is globally unique — the OAuth callback resolves a session by it alone, before it knows the workspace. */
  async findByStateNonceHash(
    input: { stateNonceHash: string },
    tx: DatabaseClient = db,
  ): Promise<ConnectSessionModel | undefined> {
    return await tx.query.connectSessionModel.findFirst({
      where: { stateNonceHash: input.stateNonceHash },
    })
  },

  /**
   * Enforces the per-workspace pending-session cap
   * (`ConnectSessionService.create`) — counts sessions still in an active
   * (non-terminal) status AND not yet past `expiresAt`. Without the
   * `expiresAt` filter, sessions abandoned mid-flow would count against the
   * cap until the `purgeExpired` cron catches up to them, even though every
   * reader already treats a past-`expiresAt` row as expired regardless of
   * its stored status.
   */
  async countActiveByWorkspaceId(
    input: { workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<number> {
    return await tx.$count(
      connectSessionModel,
      and(
        eq(connectSessionModel.workspaceId, input.workspaceId),
        sql`${connectSessionModel.status} IN ('pending', 'authorized', 'awaiting_selection')`,
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
    return row
  },

  async update(
    input: {
      id: string
      values: Partial<typeof connectSessionModel.$inferInsert>
    },
    tx: DatabaseClient = db,
  ): Promise<ConnectSessionModel | undefined> {
    const [row] = await tx
      .update(connectSessionModel)
      .set(input.values)
      .where(eq(connectSessionModel.id, input.id))
      .returning()
    return row
  },

  async listExpired(
    input: { before: Date; statuses: ConnectSessionStatus[] },
    tx: DatabaseClient = db,
  ): Promise<ConnectSessionModel[]> {
    return await tx.query.connectSessionModel.findMany({
      where: {
        expiresAt: { lte: input.before },
        status: { in: input.statuses },
      },
    })
  },

  /**
   * Atomic claim of one target id into `claimedTargetIds` — the `WHERE NOT
   * (targetId = ANY(...))` clause makes this a compare-and-set at the DB
   * level, so two concurrent `connectTargets` calls racing on the same
   * target can never both win (the loser sees `claimTarget` return `false`
   * and maps that to a `duplicated` outcome instead of double-connecting).
   */
  async claimTarget(
    input: { id: string; targetId: string },
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
          sql`NOT (${input.targetId} = ANY(${connectSessionModel.claimedTargetIds}))`,
        ),
      )
      .returning({ id: connectSessionModel.id })
    return Boolean(row)
  },
}
