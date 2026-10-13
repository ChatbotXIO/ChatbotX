import { type DatabaseClient, db, sql } from "../../client"
import type { LeaderboardAuditAction } from "../../partials/leaderboard"
import { leaderboardAuditLogModel } from "../../schema"
import { getPaginationWithDefaults } from "../../utils"

export const leaderboardScoreEventRepository = {
  /**
   * Score history of one participant. `from`/`to` bound `createdAt` so the
   * planner prunes to the leaderboard's months instead of scanning every
   * partition — callers pass the leaderboard's own time window.
   */
  async listForContact(
    input: {
      leaderboardId: string
      contactId: string
      from: Date
      to: Date
      limit: number
    },
    tx: DatabaseClient = db,
  ) {
    const result = await tx.execute<{
      id: string
      createdAt: Date
      delta: number
      source: string
      rule: string | null
      sourceRef: string | null
    }>(sql`
      SELECT "id"::text AS "id", "createdAt", "delta", "source", "rule", "sourceRef"
      FROM "LeaderboardScoreEvent"
      WHERE "leaderboardId" = ${input.leaderboardId}::bigint
        AND "contactId" = ${input.contactId}::bigint
        AND "createdAt" >= ${input.from}::timestamptz
        AND "createdAt" < ${input.to}::timestamptz
      ORDER BY "createdAt" DESC
      LIMIT ${input.limit}::int
    `)
    return result.rows.map((row) => ({
      ...row,
      createdAt: new Date(row.createdAt),
      delta: Number(row.delta),
    }))
  },

  /**
   * Workspace purge, one bounded batch: the table has no FKs, so its rows are
   * removed explicitly. Batches key on the primary key `(createdAt, id)` —
   * NOT `ctid`, which is only unique within one partition and would match
   * rows of other months on a partitioned table.
   */
  async deleteBatchByWorkspace(
    input: { workspaceId: string; limit: number },
    tx: DatabaseClient = db,
  ) {
    const result = await tx.execute(sql`
      DELETE FROM "LeaderboardScoreEvent"
      WHERE ("createdAt", "id") IN (
        SELECT "createdAt", "id" FROM "LeaderboardScoreEvent"
        WHERE "workspaceId" = ${input.workspaceId}::bigint
        LIMIT ${input.limit}::int
      )
    `)
    return result.rowCount ?? 0
  },
}

export const leaderboardAuditLogRepository = {
  async insert(
    values: {
      leaderboardId: string
      workspaceId: string
      contactId: string | null
      action: LeaderboardAuditAction
      delta: number
      actorUserId: string | null
      reason: string
    },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .insert(leaderboardAuditLogModel)
      .values(values)
      .returning()
    return row
  },

  async listPaginated(
    input: {
      leaderboardId: string
      workspaceId: string
      page: number
      perPage: number
    },
    tx: DatabaseClient = db,
  ) {
    const where = {
      leaderboardId: input.leaderboardId,
      workspaceId: input.workspaceId,
    }
    const [rows, total] = await Promise.all([
      tx.query.leaderboardAuditLogModel.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...getPaginationWithDefaults(input),
        with: {
          contact: { columns: { id: true, fullName: true, avatar: true } },
          actor: { columns: { id: true, name: true, email: true } },
        },
      }),
      tx.$count(
        leaderboardAuditLogModel,
        sql`${leaderboardAuditLogModel.leaderboardId} = ${input.leaderboardId}::bigint
          AND ${leaderboardAuditLogModel.workspaceId} = ${input.workspaceId}::bigint`,
      ),
    ])
    return { rows, total }
  },
}
