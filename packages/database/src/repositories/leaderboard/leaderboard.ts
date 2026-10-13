import { createId } from "@chatbotx.io/utils"
import {
  and,
  type DatabaseClient,
  db,
  eq,
  isNull,
  relationsFilterToSQL,
  sql,
} from "../../client"
import {
  exportSubTypes,
  fileContextTypes,
  fileStatuses,
} from "../../partials/file"
import type {
  LeaderboardPlatform,
  LeaderboardStatus,
} from "../../partials/leaderboard"
import { fileModel, leaderboardModel } from "../../schema"
import { getPaginationWithDefaults, likeContains } from "../../utils"

type LeaderboardInsert = typeof leaderboardModel.$inferInsert

export type LeaderboardListInput = {
  workspaceId: string
  status?: LeaderboardStatus | null
  platform?: LeaderboardPlatform | null
  keyword?: string | null
  page: number
  perPage: number
}

const buildWhere = (input: Omit<LeaderboardListInput, "page" | "perPage">) => ({
  workspaceId: input.workspaceId,
  deletedAt: { isNull: true as const },
  ...(input.status ? { status: input.status } : {}),
  ...(input.platform ? { platform: input.platform } : {}),
  ...(input.keyword ? { name: { ilike: likeContains(input.keyword) } } : {}),
})

export const leaderboardRepository = {
  async listPaginated(input: LeaderboardListInput, tx: DatabaseClient = db) {
    return await tx.query.leaderboardModel.findMany({
      where: buildWhere(input),
      orderBy: { createdAt: "desc" },
      ...getPaginationWithDefaults(input),
      with: {
        inbox: { columns: { id: true, name: true, channel: true } },
        minigame: { columns: { id: true, name: true, type: true } },
      },
    })
  },

  async count(
    input: Omit<LeaderboardListInput, "page" | "perPage">,
    tx: DatabaseClient = db,
  ): Promise<number> {
    return await tx.$count(
      leaderboardModel,
      relationsFilterToSQL(leaderboardModel, buildWhere(input)),
    )
  },

  /** Header KPI cards: every non-deleted leaderboard of the workspace, by status. */
  async countByStatus(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<Partial<Record<LeaderboardStatus, number>>> {
    const result = await tx.execute<{
      status: LeaderboardStatus
      total: number
    }>(sql`
      SELECT "status", count(*)::int AS "total"
      FROM "Leaderboard"
      WHERE "workspaceId" = ${workspaceId}::bigint AND "deletedAt" IS NULL
      GROUP BY "status"
    `)
    return Object.fromEntries(result.rows.map((r) => [r.status, r.total]))
  },

  async findByIdAndWorkspace(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.leaderboardModel.findFirst({
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
        deletedAt: { isNull: true },
      },
      with: {
        inbox: { columns: { id: true, name: true, channel: true } },
        minigame: { columns: { id: true, name: true, type: true } },
      },
    })
  },

  /** Unscoped lookup for the public view page, which only knows the id. */
  async findById(id: string, tx: DatabaseClient = db) {
    return await tx.query.leaderboardModel.findFirst({
      where: { id, deletedAt: { isNull: true } },
    })
  },

  /** Row lock for status transitions and score writes that must observe the status. */
  async lockById(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient,
  ) {
    const result = await tx.execute<{
      id: string
      status: LeaderboardStatus
    }>(sql`
      SELECT "id"::text, "status"
      FROM "Leaderboard"
      WHERE "id" = ${input.id}::bigint
        AND "workspaceId" = ${input.workspaceId}::bigint
        AND "deletedAt" IS NULL
      FOR UPDATE
    `)
    return result.rows[0] ?? null
  },

  /**
   * Leaderboards that can award points for an inbox right now. Paused ones are
   * included on purpose: callers decide (rules/flow skip them, manual edits
   * don't come through here).
   */
  async findLiveForInbox(inboxId: string, tx: DatabaseClient = db) {
    return await tx.query.leaderboardModel.findMany({
      where: {
        inboxId,
        status: "active",
        deletedAt: { isNull: true },
      },
    })
  },

  async findLiveForMinigame(minigameId: string, tx: DatabaseClient = db) {
    return await tx.query.leaderboardModel.findMany({
      where: {
        minigameId,
        status: "active",
        deletedAt: { isNull: true },
      },
    })
  },

  async findLiveForWorkspace(workspaceId: string, tx: DatabaseClient = db) {
    return await tx.query.leaderboardModel.findMany({
      where: {
        workspaceId,
        status: { in: ["active", "paused"] },
        deletedAt: { isNull: true },
      },
    })
  },

  /** Every active/paused leaderboard across workspaces — for the hourly ranking maintenance. */
  async findAllLive(tx: DatabaseClient = db) {
    return await tx.query.leaderboardModel.findMany({
      where: {
        status: { in: ["active", "paused"] },
        deletedAt: { isNull: true },
      },
      columns: {
        id: true,
        workspaceId: true,
        startsAt: true,
        status: true,
        resetTime: true,
      },
    })
  },

  /** Active/paused leaderboards whose end time has passed — closed by the finish cron. */
  async findOverdue(now: Date, tx: DatabaseClient = db) {
    return await tx.query.leaderboardModel.findMany({
      where: {
        status: { in: ["active", "paused"] },
        endsAt: { lte: now },
        deletedAt: { isNull: true },
      },
      columns: { id: true, workspaceId: true },
    })
  },

  /** Earliest `startsAt` among live leaderboards — partitions from that month on must be kept. */
  async findEarliestLiveStart(tx: DatabaseClient = db): Promise<Date | null> {
    const result = await tx.execute<{ startsAt: Date | null }>(sql`
      SELECT min("startsAt") AS "startsAt"
      FROM "Leaderboard"
      WHERE "status" IN ('active', 'paused') AND "deletedAt" IS NULL
    `)
    const value = result.rows[0]?.startsAt
    return value ? new Date(value) : null
  },

  async insert(values: LeaderboardInsert, tx: DatabaseClient = db) {
    const [row] = await tx.insert(leaderboardModel).values(values).returning()
    return row
  },

  async update(
    input: { id: string; workspaceId: string },
    values: Partial<LeaderboardInsert>,
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .update(leaderboardModel)
      .set(values)
      .where(
        and(
          eq(leaderboardModel.id, input.id),
          eq(leaderboardModel.workspaceId, input.workspaceId),
          isNull(leaderboardModel.deletedAt),
        ),
      )
      .returning()
    return row ?? null
  },

  async createExportFile(
    input: {
      workspaceId: string
      userId: string | null
      fileName: string
      path: string
    },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .insert(fileModel)
      .values({
        id: createId(),
        workspaceId: input.workspaceId,
        userId: input.userId,
        contextType: fileContextTypes.enum.export,
        subType: exportSubTypes.enum.leaderboardParticipants,
        path: input.path,
        fileName: input.fileName,
        mimeType: "text/csv",
        status: fileStatuses.enum.pending,
      })
      .returning()
    return row
  },

  async findExportFile(
    input: { workspaceId: string; fileId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.fileModel.findFirst({
      where: {
        id: input.fileId,
        workspaceId: input.workspaceId,
        contextType: fileContextTypes.enum.export,
        subType: exportSubTypes.enum.leaderboardParticipants,
      },
    })
  },
}
