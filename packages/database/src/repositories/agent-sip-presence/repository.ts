import {
  and,
  type DatabaseClient,
  db,
  eq,
  gt,
  inArray,
  lt,
  sql,
} from "../../client"
import { agentSipPresenceModel, workspaceMemberModel } from "../../schema"

type AgentSipPresenceRow = typeof agentSipPresenceModel.$inferSelect

type UpsertFromRegisterInput = {
  workspaceId: string
  userId: string
  contact: string | null
  expiresAt: Date
}

type SelectRingTargetsInput = {
  workspaceId: string
  /**
   * Not yet joined against — no dedicated inbox-permission table exists in
   * the schema (only `WorkspaceMember`/`InboxTeamMember`, neither models
   * per-inbox access). Kept in the signature per the plan's contract so the
   * business layer can add the join once that model exists; today ring
   * targets are scoped to workspace membership only. See PR notes.
   */
  inboxId: string
  limit: number
  now?: Date
}

class AgentSipPresenceRepository {
  /** Upserts the presence row from a `sofia::register`/`unregister`/`expire` event. */
  async upsertFromRegister(
    input: UpsertFromRegisterInput,
    tx: DatabaseClient = db,
  ): Promise<AgentSipPresenceRow> {
    const [row] = await tx
      .insert(agentSipPresenceModel)
      .values(input)
      .onConflictDoUpdate({
        target: [
          agentSipPresenceModel.workspaceId,
          agentSipPresenceModel.userId,
        ],
        set: {
          contact: input.contact,
          expiresAt: input.expiresAt,
        },
      })
      .returning()

    if (!row) {
      throw new Error(
        `AgentSipPresence upsert race lost for workspaceId ${input.workspaceId} userId ${input.userId}`,
      )
    }
    return row
  }

  /** Marks a presence row expired immediately (`sofia::unregister`). */
  async expire(
    input: { workspaceId: string; userId: string; at: Date },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(agentSipPresenceModel)
      .set({ expiresAt: input.at })
      .where(
        and(
          eq(agentSipPresenceModel.workspaceId, input.workspaceId),
          eq(agentSipPresenceModel.userId, input.userId),
        ),
      )
  }

  /**
   * Bounded ring-set selection: registered, live agents in the
   * workspace, least-recently-rung first. Uses
   * `AgentSipPresence_ring_idx (workspaceId, expiresAt DESC, lastRungAt ASC)`
   * — one index range scan, no `COUNT`. Bumps `lastRungAt` for the selected
   * rows in a single follow-up `UPDATE … WHERE userId = ANY($ids)` inside
   * the same transaction, so the next call sees the new ordering.
   */
  async selectRingTargets(
    input: SelectRingTargetsInput,
    tx: DatabaseClient = db,
  ): Promise<string[]> {
    const now = input.now ?? new Date()
    return await this.runInTransaction(tx, async (trx) => {
      const rows = await trx
        .select({ userId: agentSipPresenceModel.userId })
        .from(agentSipPresenceModel)
        .innerJoin(
          workspaceMemberModel,
          and(
            eq(workspaceMemberModel.userId, agentSipPresenceModel.userId),
            eq(workspaceMemberModel.workspaceId, input.workspaceId),
          ),
        )
        .where(
          and(
            eq(agentSipPresenceModel.workspaceId, input.workspaceId),
            gt(agentSipPresenceModel.expiresAt, now),
          ),
        )
        // Least-recently-rung first — uses
        // `AgentSipPresence_ring_idx (workspaceId, expiresAt DESC,
        // lastRungAt ASC)`.
        .orderBy(sql`${agentSipPresenceModel.lastRungAt} ASC NULLS FIRST`)
        .limit(input.limit)

      const userIds = rows.map((row) => row.userId)
      if (userIds.length > 0) {
        await trx
          .update(agentSipPresenceModel)
          .set({ lastRungAt: now })
          .where(
            and(
              eq(agentSipPresenceModel.workspaceId, input.workspaceId),
              inArray(agentSipPresenceModel.userId, userIds),
            ),
          )
      }
      return userIds
    })
  }

  /** Daily sweeper: drops presence rows that have been stale for a while. */
  async deleteExpired(
    input: { olderThan: Date },
    tx: DatabaseClient = db,
  ): Promise<number> {
    const deleted = await tx
      .delete(agentSipPresenceModel)
      .where(lt(agentSipPresenceModel.expiresAt, input.olderThan))
      .returning({ id: agentSipPresenceModel.id })
    return deleted.length
  }

  private async runInTransaction<T>(
    tx: DatabaseClient,
    fn: (trx: DatabaseClient) => Promise<T>,
  ): Promise<T> {
    if (tx !== db) {
      return await fn(tx)
    }
    return await db.transaction((trx) => fn(trx))
  }
}

export const agentSipPresenceRepository = new AgentSipPresenceRepository()
