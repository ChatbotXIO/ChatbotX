import {
  and,
  count,
  type DatabaseClient,
  db,
  desc,
  eq,
  gt,
  lte,
  sql,
} from "@chatbotx.io/database/client"
import type { MacEventType } from "@chatbotx.io/database/partials"
import {
  contactActiveMonthlyModel,
  workspaceMacModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { logger } from "../../lib/logger"
import { anchoredPeriod } from "../../lib/mac-period"

export type WorkspaceCounterRow = {
  workspaceMacId: string
  macCount: number
}

export type PreparedRow = {
  workspaceId: string
  contactId: string
  contactInboxId: string
  inboxId: string
  eventType: MacEventType
  occurredAt: Date
  hourBucket: Date
  periodStart: Date
  periodEnd: Date
  workspaceMacId: string
}

export type WorkspaceMacDelta = {
  workspaceMacId: string
  count: number
}

export type CountDelta = {
  id: string
  count: number
}

type ActiveContactCount = {
  periodStart: string | undefined
  periodEnd: string | null | undefined
  macCount: number
}

export function workspaceMacKey(
  workspaceId: string,
  periodStart: Date,
  periodEnd: Date,
): string {
  return `${workspaceId}|${periodStart.toISOString()}|${periodEnd.toISOString()}`
}

function toIso(value: unknown): string | undefined {
  return value
    ? new Date(value as string | number | Date).toISOString()
    : undefined
}

export class MacRepository {
  async ensureWorkspaceMac(
    entries: { workspaceId: string; periodStart: Date; periodEnd: Date }[],
    client: DatabaseClient = db,
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>()

    for (const entry of entries) {
      const [row] = await client
        .insert(workspaceMacModel)
        .values({
          workspaceId: entry.workspaceId,
          periodStart: entry.periodStart,
          periodEnd: entry.periodEnd,
        })
        .onConflictDoUpdate({
          target: [
            workspaceMacModel.workspaceId,
            workspaceMacModel.periodStart,
            workspaceMacModel.periodEnd,
          ],
          set: { updatedAt: sql`now()` },
        })
        .returning({
          id: workspaceMacModel.id,
          workspaceId: workspaceMacModel.workspaceId,
          periodStart: workspaceMacModel.periodStart,
          periodEnd: workspaceMacModel.periodEnd,
        })

      if (row?.id) {
        result.set(
          workspaceMacKey(
            row.workspaceId,
            new Date(row.periodStart),
            new Date(row.periodEnd),
          ),
          row.id,
        )
      }
    }
    return result
  }

  async upsertMonthlyPresence(
    rows: PreparedRow[],
    client: DatabaseClient = db,
  ): Promise<WorkspaceMacDelta[]> {
    if (rows.length === 0) {
      return []
    }

    const insertedRows = await client
      .insert(contactActiveMonthlyModel)
      .values(
        rows.map((row) => ({
          workspaceId: row.workspaceId,
          contactId: row.contactId,
          contactInboxId: row.contactInboxId,
          periodStart: row.periodStart,
          inboxId: row.inboxId,
          workspaceMacId: row.workspaceMacId,
        })),
      )
      .onConflictDoNothing()
      .returning({ workspaceMacId: contactActiveMonthlyModel.workspaceMacId })

    const countByWorkspaceMacId = new Map<string, number>()
    for (const row of insertedRows) {
      countByWorkspaceMacId.set(
        row.workspaceMacId,
        (countByWorkspaceMacId.get(row.workspaceMacId) ?? 0) + 1,
      )
    }

    return Array.from(countByWorkspaceMacId, ([workspaceMacId, count]) => ({
      workspaceMacId,
      count,
    }))
  }

  async addWorkspaceMacCount(
    deltas: CountDelta[],
    client: DatabaseClient = db,
  ): Promise<WorkspaceCounterRow[]> {
    const counted: WorkspaceCounterRow[] = []

    for (const delta of deltas) {
      const [updated] = await client
        .update(workspaceMacModel)
        .set({
          macCount: sql`${workspaceMacModel.macCount} + ${delta.count}`,
          updatedAt: sql`now()`,
        })
        .where(eq(workspaceMacModel.id, delta.id))
        .returning({
          id: workspaceMacModel.id,
          macCount: workspaceMacModel.macCount,
        })

      if (updated) {
        counted.push({
          workspaceMacId: updated.id,
          macCount: Number(updated.macCount),
        })
      } else {
        logger.warn(
          { workspaceMacId: delta.id, count: delta.count },
          "[MacRepository] addWorkspaceMacCount: no WorkspaceMac row, increment dropped",
        )
      }
    }
    return counted
  }

  async getActiveContactCountByWorkspaceId(
    input: { workspaceId: string },
    client: DatabaseClient = db,
  ): Promise<ActiveContactCount> {
    const [row] = await client
      .select({
        periodStart: workspaceMacModel.periodStart,
        periodEnd: workspaceMacModel.periodEnd,
        macCount: workspaceMacModel.macCount,
      })
      .from(workspaceMacModel)
      .where(
        and(
          eq(workspaceMacModel.workspaceId, input.workspaceId),
          lte(workspaceMacModel.periodStart, sql`now()`),
          gt(workspaceMacModel.periodEnd, sql`now()`),
        ),
      )
      .orderBy(desc(workspaceMacModel.id))
      .limit(1)

    return {
      periodStart: toIso(row?.periodStart),
      periodEnd: toIso(row?.periodEnd) ?? null,
      macCount: row ? Number(row.macCount) : 0,
    }
  }

  /**
   * The owner's monthly-active-contacts count, read from the durable
   * `ContactActiveMonthly` ledger across every workspace they own. This is the
   * authoritative source for `UserQuota.macUsed`: every MAC increment (webchat,
   * worker, import, message tracking) writes a presence row in the same
   * transaction as the live-counter bump, so the ledger never under-counts.
   *
   *  - `cumulative: false` (resetting plans) counts only the period containing
   *    now, anchored to `billingPeriodStart` — the standard "this month" MAC.
   *  - `cumulative: true` (lifetime plans, which never reset) counts every
   *    period, matching the live counter that lifetime plans accumulate.
   *
   * Returns 0 when there is no billing anchor (period-less owners are not
   * MAC-tracked).
   */
  async countActiveContactsForOwner(
    input: {
      ownerId: string
      billingPeriodStart: Date | null
      cumulative: boolean
    },
    client: DatabaseClient = db,
  ): Promise<number> {
    const conditions = [eq(workspaceModel.ownerId, input.ownerId)]

    if (!input.cumulative) {
      if (!input.billingPeriodStart) {
        return 0
      }
      const { start } = anchoredPeriod(new Date(), input.billingPeriodStart)
      conditions.push(eq(contactActiveMonthlyModel.periodStart, start))
    }

    const [row] = await client
      .select({ value: count() })
      .from(contactActiveMonthlyModel)
      .innerJoin(
        workspaceModel,
        eq(contactActiveMonthlyModel.workspaceId, workspaceModel.id),
      )
      .where(and(...conditions))

    return row ? Number(row.value) : 0
  }

  async reconcilePeriod(
    input: { workspaceId: string; periodStart: string },
    client: DatabaseClient = db,
  ): Promise<void> {
    const periodStart = new Date(input.periodStart)

    const activeContactCount = client
      .select({ count: sql<number>`count(*)::int` })
      .from(contactActiveMonthlyModel)
      .where(
        and(
          eq(contactActiveMonthlyModel.workspaceId, input.workspaceId),
          eq(contactActiveMonthlyModel.periodStart, periodStart),
        ),
      )

    await client
      .update(workspaceMacModel)
      .set({
        macCount: sql<number>`(${activeContactCount})`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(workspaceMacModel.workspaceId, input.workspaceId),
          eq(workspaceMacModel.periodStart, periodStart),
        ),
      )
  }
}

export const macRepository = new MacRepository()
