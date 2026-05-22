import {
  and,
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
  billingMacModel,
  contactActiveMonthlyModel,
  workspaceMacModel,
} from "@chatbotx.io/database/schema"
import { logger } from "../../lib/logger"

export type WorkspaceCounterRow = {
  workspaceMacId: string
  macCount: number
}

export type BillingCounterRow = {
  billingMacId: string
  macCount: number
}

/**
 * A contact event ready for persistence. `billingMacId`/`workspaceMacId` are
 * resolved by `MacTrackingService.resolveMacIds` before any contact row is
 * written — both contact tables carry `workspaceMacId`.
 */
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
  billingId: string
  billingMacId: string
  workspaceMacId: string
}

/** New-contact count for one `WorkspaceMac` row, returned by the monthly upsert. */
export type WorkspaceMacDelta = {
  workspaceMacId: string
  count: number
}

/** A single-id increment applied to a `WorkspaceMac` or `BillingMac` row. */
export type CountDelta = {
  id: string
  count: number
}

/** The `{ periodStart, periodEnd, macCount }` shape the count queries return. */
type ActiveContactCount = {
  periodStart: string | undefined
  periodEnd: string | null | undefined
  macCount: number
}

/** Map key for a `BillingMac` lookup by `(billingId, periodStart, periodEnd)`. */
export function billingMacKey(
  billingId: string,
  periodStart: Date,
  periodEnd: Date,
): string {
  return `${billingId}|${periodStart.toISOString()}|${periodEnd.toISOString()}`
}

/** Map key for a `WorkspaceMac` lookup by `(workspaceId, billingMacId)`. */
export function workspaceMacKey(
  workspaceId: string,
  billingMacId: string,
): string {
  return `${workspaceId}|${billingMacId}`
}

/** Normalizes a DB timestamp value (Date in prod, string in tests) to ISO. */
function toIso(value: unknown): string | undefined {
  return value
    ? new Date(value as string | number | Date).toISOString()
    : undefined
}

export class MacRepository {
  /**
   * Resolves the `BillingMac` id for each `(billingId, periodStart, periodEnd)`
   * tuple. One `INSERT ... ON CONFLICT DO UPDATE` per entry: the `DO UPDATE`
   * no-op lets `RETURNING` yield a pre-existing row too (a bare `DO NOTHING`
   * would skip it). Duplicate tuples just resolve the same key twice. Returns a
   * map keyed by `billingMacKey`.
   */
  async ensureBillingMac(
    entries: { billingId: string; periodStart: Date; periodEnd: Date }[],
    client: DatabaseClient = db,
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>()

    for (const entry of entries) {
      const [row] = await client
        .insert(billingMacModel)
        .values({
          billingId: entry.billingId,
          periodStart: entry.periodStart,
          periodEnd: entry.periodEnd,
        })
        .onConflictDoUpdate({
          target: [
            billingMacModel.billingId,
            billingMacModel.periodStart,
            billingMacModel.periodEnd,
          ],
          set: { updatedAt: sql`now()` },
        })
        .returning({
          id: billingMacModel.id,
          billingId: billingMacModel.billingId,
          periodStart: billingMacModel.periodStart,
          periodEnd: billingMacModel.periodEnd,
        })

      if (row?.id) {
        result.set(
          billingMacKey(
            row.billingId,
            new Date(row.periodStart),
            new Date(row.periodEnd),
          ),
          row.id,
        )
      }
    }
    return result
  }

  /**
   * Resolves the `WorkspaceMac` id for each `(workspaceId, billingMacId)` pair.
   * One `INSERT ... ON CONFLICT DO UPDATE` per entry. Duplicate pairs just
   * resolve the same key twice. Returns a map keyed by `workspaceMacKey`.
   */
  async ensureWorkspaceMac(
    entries: { workspaceId: string; billingMacId: string }[],
    client: DatabaseClient = db,
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>()

    for (const entry of entries) {
      const [row] = await client
        .insert(workspaceMacModel)
        .values({
          workspaceId: entry.workspaceId,
          billingMacId: entry.billingMacId,
        })
        .onConflictDoUpdate({
          target: [
            workspaceMacModel.workspaceId,
            workspaceMacModel.billingMacId,
          ],
          set: { updatedAt: sql`now()` },
        })
        .returning({
          id: workspaceMacModel.id,
          workspaceId: workspaceMacModel.workspaceId,
          billingMacId: workspaceMacModel.billingMacId,
        })

      if (row?.id) {
        result.set(workspaceMacKey(row.workspaceId, row.billingMacId), row.id)
      }
    }
    return result
  }

  /**
   * Inserts monthly-presence rows in one statement and returns the new-contact
   * count per `WorkspaceMac` id. The `RETURNING` rows of a `DO NOTHING` insert
   * are exactly the ones inserted, so grouping them gives the per-workspace
   * counts. Each new contact contributes 1 MAC.
   *
   * CRITICAL: the conflict action must stay `DO NOTHING`. Changing it to
   * `DO UPDATE` would make every pre-existing contact row appear in `RETURNING`
   * and inflate the billed MAC count on each re-run.
   */
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
          billingId: row.billingId,
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

  /**
   * Adds each delta onto `WorkspaceMac.macCount`, one `UPDATE` per delta. The
   * update is additive (`macCount = macCount + count`), so two deltas for the
   * same id both apply and the final count is still correct. A delta whose id
   * matches no row is logged at `warn` — a dropped billing increment must stay
   * visible so it can be recovered via `reconcilePeriod`.
   */
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

  /**
   * Adds each delta onto `BillingMac.macCount`, one `UPDATE` per delta. The
   * update is additive, so duplicate ids both apply and stay correct. A delta
   * whose id matches no row is logged at `warn`.
   */
  async addBillingMacCount(
    deltas: CountDelta[],
    client: DatabaseClient = db,
  ): Promise<BillingCounterRow[]> {
    const counted: BillingCounterRow[] = []

    for (const delta of deltas) {
      const [updated] = await client
        .update(billingMacModel)
        .set({
          macCount: sql`${billingMacModel.macCount} + ${delta.count}`,
          updatedAt: sql`now()`,
        })
        .where(eq(billingMacModel.id, delta.id))
        .returning({
          id: billingMacModel.id,
          macCount: billingMacModel.macCount,
        })

      if (updated) {
        counted.push({
          billingMacId: updated.id,
          macCount: Number(updated.macCount),
        })
      } else {
        logger.warn(
          { billingMacId: delta.id, count: delta.count },
          "[MacRepository] addBillingMacCount: no BillingMac row, increment dropped",
        )
      }
    }
    return counted
  }

  /**
   * Active MAC count for a workspace: joins the workspace's `WorkspaceMac` to
   * the `BillingMac` whose period currently brackets `now()`.
   */
  async getActiveContactCountByWorkspaceId(
    input: {
      workspaceId: string
    },
    client: DatabaseClient = db,
  ): Promise<ActiveContactCount> {
    const [row] = await client
      .select({
        periodStart: billingMacModel.periodStart,
        periodEnd: billingMacModel.periodEnd,
        macCount: workspaceMacModel.macCount,
      })
      .from(workspaceMacModel)
      .innerJoin(
        billingMacModel,
        eq(billingMacModel.id, workspaceMacModel.billingMacId),
      )
      .where(
        and(
          eq(workspaceMacModel.workspaceId, input.workspaceId),
          lte(billingMacModel.periodStart, sql`now()`),
          gt(billingMacModel.periodEnd, sql`now()`),
        ),
      )
      .orderBy(desc(billingMacModel.id))
      .limit(1)

    return {
      periodStart: toIso(row?.periodStart),
      periodEnd: toIso(row?.periodEnd) ?? null,
      macCount: row ? Number(row.macCount) : 0,
    }
  }

  /** Active MAC count for a billing record's current period. */
  async getActiveContactCountByBillingId(
    input: {
      billingId: string
    },
    client: DatabaseClient = db,
  ): Promise<ActiveContactCount> {
    const [row] = await client
      .select({
        periodStart: billingMacModel.periodStart,
        periodEnd: billingMacModel.periodEnd,
        macCount: billingMacModel.macCount,
      })
      .from(billingMacModel)
      .where(
        and(
          eq(billingMacModel.billingId, input.billingId),
          lte(billingMacModel.periodStart, sql`now()`),
          gt(billingMacModel.periodEnd, sql`now()`),
        ),
      )
      .orderBy(desc(billingMacModel.id))
      .limit(1)

    return {
      periodStart: toIso(row?.periodStart),
      periodEnd: toIso(row?.periodEnd) ?? null,
      macCount: row ? Number(row.macCount) : 0,
    }
  }

  /**
   * Recomputes the MAC counters for one workspace/period from the authoritative
   * `ContactActiveMonthly` row count:
   *
   *  1. `WorkspaceMac.macCount` = the distinct monthly-presence row count.
   *  2. `BillingMac.macCount` = the sum of every `WorkspaceMac.macCount` under
   *     it — without this, a reconcile would leave the billing-level counter
   *     diverged from the workspace-level one it rolls up.
   *
   * The target rows are resolved via the `WorkspaceMac -> BillingMac` join on
   * `(workspaceId, BillingMac.periodStart)`.
   */
  async reconcilePeriod(
    input: {
      workspaceId: string
      periodStart: string
    },
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
      .from(billingMacModel)
      .where(
        and(
          eq(workspaceMacModel.billingMacId, billingMacModel.id),
          eq(workspaceMacModel.workspaceId, input.workspaceId),
          eq(billingMacModel.periodStart, periodStart),
        ),
      )

    // Re-sum BillingMac from its WorkspaceMac children so the billing-level
    // counter matches the workspace-level counter just rebuilt above.
    const [target] = await client
      .select({ billingMacId: workspaceMacModel.billingMacId })
      .from(workspaceMacModel)
      .innerJoin(
        billingMacModel,
        eq(billingMacModel.id, workspaceMacModel.billingMacId),
      )
      .where(
        and(
          eq(workspaceMacModel.workspaceId, input.workspaceId),
          eq(billingMacModel.periodStart, periodStart),
        ),
      )
      .orderBy(desc(workspaceMacModel.billingMacId))
      .limit(1)

    if (!target) {
      return
    }

    const billingMacTotal = client
      .select({
        total: sql<number>`coalesce(sum(${workspaceMacModel.macCount}), 0)::int`,
      })
      .from(workspaceMacModel)
      .where(eq(workspaceMacModel.billingMacId, target.billingMacId))

    await client
      .update(billingMacModel)
      .set({
        macCount: sql<number>`(${billingMacTotal})`,
        updatedAt: sql`now()`,
      })
      .where(eq(billingMacModel.id, target.billingMacId))
  }
}

export const macRepository = new MacRepository()
