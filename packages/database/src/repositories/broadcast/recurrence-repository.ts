import type { RecurrenceRule } from "@chatbotx.io/utils/recurrence"
import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm"
import { type DatabaseClient, db } from "../../client"
import type {
  BroadcastOccurrenceOutcome,
  BroadcastOccurrenceReason,
  OccurrenceBucketGranularity,
} from "../../partials/broadcast"
import { zonedBucketKey } from "../../queries/date-bucket"
import {
  broadcastModel,
  broadcastRecurrenceModel,
  broadcastRecurrenceOccurrenceModel,
} from "../../schema"
import type {
  BroadcastModel,
  BroadcastRecurrenceModel,
  BroadcastRecurrenceOccurrenceModel,
} from "../../types"

/** A series whose `nextRunAt` has come due, as the per-minute scan returns it. */
export type DueRecurrence = {
  id: string
  workspaceId: string
  nextRunAt: Date
}

export type DueRecurrenceCursor = { nextRunAt: Date; id: string }

export type LedgerRowInput = {
  workspaceId: string
  recurrenceId: string
  localSlot: string
  occurrenceAt: Date
  outcome: BroadcastOccurrenceOutcome
  reason: BroadcastOccurrenceReason | null
  childBroadcastId: string | null
  materializedAt: Date
  supersededCount?: number
}

/** One (bucket, outcome, reason, run state) cell of the grouped ledger. */
export type LedgerBucketCell = {
  bucket: string
  outcome: BroadcastOccurrenceOutcome
  reason: BroadcastOccurrenceReason | null
  runStatus: string | null
  slots: number
}

export type LedgerRowWithRun = BroadcastRecurrenceOccurrenceModel & {
  run: Pick<BroadcastModel, "id" | "status" | "contactCount"> | null
}

const toRows = <T>(result: { rows: T[] }): T[] => result.rows

export const broadcastRecurrenceRepository = {
  /** The database clock — every due cutoff and catch-up decision uses it, never a worker's. */
  async selectDbNow(tx: DatabaseClient = db): Promise<Date> {
    const [row] = toRows(
      await tx.execute<{ now: Date }>(sql`SELECT now() AS "now"`),
    )
    return new Date(row.now)
  },

  /**
   * Armed series whose slot is due, oldest first, as a keyset page over
   * `(nextRunAt, id)`. The cutoff is evaluated in SQL so worker clock skew
   * cannot make a slot early or late.
   */
  async listDue(
    input: { limit: number; cursor?: DueRecurrenceCursor | null },
    tx: DatabaseClient = db,
  ): Promise<DueRecurrence[]> {
    const rows = await tx
      .select({
        id: broadcastRecurrenceModel.id,
        workspaceId: broadcastRecurrenceModel.workspaceId,
        nextRunAt: broadcastRecurrenceModel.nextRunAt,
      })
      .from(broadcastRecurrenceModel)
      .where(
        and(
          sql`${broadcastRecurrenceModel.nextRunAt} IS NOT NULL`,
          sql`${broadcastRecurrenceModel.nextRunAt} <= now()`,
          input.cursor
            ? sql`(${broadcastRecurrenceModel.nextRunAt}, ${broadcastRecurrenceModel.id}) > (${input.cursor.nextRunAt}, ${input.cursor.id})`
            : undefined,
        ),
      )
      .orderBy(
        asc(broadcastRecurrenceModel.nextRunAt),
        asc(broadcastRecurrenceModel.id),
      )
      .limit(input.limit)

    return rows.flatMap((row) =>
      row.nextRunAt ? [{ ...row, nextRunAt: row.nextRunAt }] : [],
    )
  },

  /** Age in ms of the oldest due series, or null when nothing is due — the number an operator alerts on. */
  async findOldestDueAgeMs(tx: DatabaseClient = db): Promise<number | null> {
    const [row] = toRows(
      await tx.execute<{ ageMs: number | null }>(sql`
        SELECT (EXTRACT(EPOCH FROM (now() - min("nextRunAt"))) * 1000)::float8 AS "ageMs"
        FROM "BroadcastRecurrence"
        WHERE "nextRunAt" IS NOT NULL AND "nextRunAt" <= now()
      `),
    )
    return row?.ageMs ?? null
  },

  /**
   * Locks recurrence rows by template id in ascending id order. This is the
   * FIRST lock of every transaction that touches both tables (the order is
   * recurrence rows, then broadcast rows) so two paths never deadlock.
   */
  async lockForWrite(
    tx: DatabaseClient,
    input: { workspaceId: string; broadcastIds: string[] },
  ): Promise<BroadcastRecurrenceModel[]> {
    if (input.broadcastIds.length === 0) {
      return []
    }
    return await tx
      .select()
      .from(broadcastRecurrenceModel)
      .where(
        and(
          eq(broadcastRecurrenceModel.workspaceId, input.workspaceId),
          inArray(broadcastRecurrenceModel.broadcastId, input.broadcastIds),
        ),
      )
      .orderBy(asc(broadcastRecurrenceModel.id))
      .for("update")
  },

  /** Locks every recurrence of a workspace, ascending id (workspace teardown). */
  async lockAllForWorkspace(
    tx: DatabaseClient,
    input: { workspaceId: string },
  ): Promise<BroadcastRecurrenceModel[]> {
    return await tx
      .select()
      .from(broadcastRecurrenceModel)
      .where(eq(broadcastRecurrenceModel.workspaceId, input.workspaceId))
      .orderBy(asc(broadcastRecurrenceModel.id))
      .for("update")
  },

  /** Recurrence (locked) and its template (locked second), or null when either is gone. */
  async findForMaterialize(
    tx: DatabaseClient,
    input: { recurrenceId: string; workspaceId: string },
  ): Promise<{
    recurrence: BroadcastRecurrenceModel
    template: BroadcastModel
  } | null> {
    const [recurrence] = await tx
      .select()
      .from(broadcastRecurrenceModel)
      .where(
        and(
          eq(broadcastRecurrenceModel.id, input.recurrenceId),
          // The job's workspace is what the blocked-owner guard checked, so a
          // series of another workspace must never be materialized under it.
          eq(broadcastRecurrenceModel.workspaceId, input.workspaceId),
        ),
      )
      .for("update", { of: broadcastRecurrenceModel })
      .limit(1)
    if (!recurrence) {
      return null
    }
    const [template] = await tx
      .select()
      .from(broadcastModel)
      .where(eq(broadcastModel.id, recurrence.broadcastId))
      .for("update")
      .limit(1)
    return template ? { recurrence, template } : null
  },

  async findByBroadcastId(
    tx: DatabaseClient,
    input: { broadcastId: string },
  ): Promise<BroadcastRecurrenceModel | null> {
    const [row] = await tx
      .select()
      .from(broadcastRecurrenceModel)
      .where(eq(broadcastRecurrenceModel.broadcastId, input.broadcastId))
      .limit(1)
    return row ?? null
  },

  /** Creates the series row if the template has none; an existing row is left untouched. */
  async insertIfMissing(
    tx: DatabaseClient,
    input: {
      workspaceId: string
      broadcastId: string
      rule: RecurrenceRule
    },
  ): Promise<void> {
    await tx
      .insert(broadcastRecurrenceModel)
      .values(input)
      .onConflictDoNothing({ target: broadcastRecurrenceModel.broadcastId })
  },

  async update(
    tx: DatabaseClient,
    input: {
      id: string
      patch: Partial<
        Pick<
          BroadcastRecurrenceModel,
          | "rule"
          | "nextRunAt"
          | "accountedThroughAt"
          | "occurrenceCount"
          | "lastOccurrenceAt"
          | "pausedAt"
          | "endedAt"
        >
      >
      /** Compare-and-set on the slot being handled: no row is written if it moved. */
      expectedNextRunAt?: Date
    },
  ): Promise<boolean> {
    const rows = await tx
      .update(broadcastRecurrenceModel)
      .set(input.patch)
      .where(
        and(
          eq(broadcastRecurrenceModel.id, input.id),
          input.expectedNextRunAt
            ? eq(broadcastRecurrenceModel.nextRunAt, input.expectedNextRunAt)
            : undefined,
        ),
      )
      .returning({ id: broadcastRecurrenceModel.id })
    return rows.length > 0
  },

  // ---- ledger -------------------------------------------------------------

  /** Idempotent on `(recurrenceId, localSlot, occurrenceAt)`: a replayed slot never writes a second row. */
  async insertLedgerRows(
    tx: DatabaseClient,
    rows: LedgerRowInput[],
  ): Promise<void> {
    if (rows.length === 0) {
      return
    }
    await tx
      .insert(broadcastRecurrenceOccurrenceModel)
      .values(rows)
      .onConflictDoNothing({
        target: [
          broadcastRecurrenceOccurrenceModel.recurrenceId,
          broadcastRecurrenceOccurrenceModel.localSlot,
          broadcastRecurrenceOccurrenceModel.occurrenceAt,
        ],
      })
  },

  async findLedgerRow(
    tx: DatabaseClient,
    input: { recurrenceId: string; localSlot: string; occurrenceAt: Date },
  ): Promise<BroadcastRecurrenceOccurrenceModel | null> {
    const [row] = await tx
      .select()
      .from(broadcastRecurrenceOccurrenceModel)
      .where(
        and(
          eq(
            broadcastRecurrenceOccurrenceModel.recurrenceId,
            input.recurrenceId,
          ),
          eq(broadcastRecurrenceOccurrenceModel.localSlot, input.localSlot),
          eq(
            broadcastRecurrenceOccurrenceModel.occurrenceAt,
            input.occurrenceAt,
          ),
        ),
      )
      .limit(1)
    return row ?? null
  },

  /** Slots the ledger accounts for: a backfill summary row stands for `supersededCount` of them. */
  async countLedgerSlots(
    input: { recurrenceId: string },
    tx: DatabaseClient = db,
  ): Promise<number> {
    const o = broadcastRecurrenceOccurrenceModel
    const [row] = await tx
      .select({
        slots: sql<number>`coalesce(sum(${o.supersededCount}), 0)::int`,
      })
      .from(o)
      .where(eq(o.recurrenceId, input.recurrenceId))
    return row?.slots ?? 0
  },

  /**
   * One page of bucket keys (newest first) with a keyset cursor on the key.
   * Bucketing happens in SQL in the caller's timezone.
   */
  async listLedgerBucketKeys(
    input: {
      recurrenceId: string
      granularity: OccurrenceBucketGranularity
      timezone: string
      limit: number
      cursor?: string | null
    },
    tx: DatabaseClient = db,
  ): Promise<string[]> {
    const bucket = zonedBucketKey(
      broadcastRecurrenceOccurrenceModel.occurrenceAt,
      input.granularity,
      input.timezone,
    )
    const rows = await tx
      .select({ bucket })
      .from(broadcastRecurrenceOccurrenceModel)
      .where(
        and(
          eq(
            broadcastRecurrenceOccurrenceModel.recurrenceId,
            input.recurrenceId,
          ),
          input.cursor ? lt(bucket, input.cursor) : undefined,
        ),
      )
      // Ordinals, not the expression: it carries bound parameters, and each
      // repetition renders with new placeholder numbers that Postgres treats as
      // a different expression ("must appear in the GROUP BY clause").
      .groupBy(sql`1`)
      .orderBy(sql`1 DESC`)
      .limit(input.limit)
    return rows.map((row) => row.bucket)
  },

  /** Ledger cells for the given buckets, grouped by outcome, reason and the run's current status. */
  async listLedgerBucketCells(
    input: {
      recurrenceId: string
      granularity: OccurrenceBucketGranularity
      timezone: string
      buckets: string[]
    },
    tx: DatabaseClient = db,
  ): Promise<LedgerBucketCell[]> {
    if (input.buckets.length === 0) {
      return []
    }
    const o = broadcastRecurrenceOccurrenceModel
    const bucket = zonedBucketKey(
      o.occurrenceAt,
      input.granularity,
      input.timezone,
    )
    const rows = await tx
      .select({
        bucket,
        outcome: o.outcome,
        reason: o.reason,
        runStatus: broadcastModel.status,
        slots: sql<number>`sum(${o.supersededCount})::int`,
      })
      .from(o)
      .leftJoin(broadcastModel, eq(broadcastModel.id, o.childBroadcastId))
      .where(
        and(
          eq(o.recurrenceId, input.recurrenceId),
          inArray(bucket, input.buckets),
        ),
      )
      .groupBy(sql`1`, o.outcome, o.reason, broadcastModel.status)
    return rows as LedgerBucketCell[]
  },

  /** Ledger rows newest first with the run each one created. */
  async listLedgerRows(
    input: {
      recurrenceId: string
      from?: Date | null
      to?: Date | null
      cursor?: { occurrenceAt: Date; id: string } | null
      limit: number
    },
    tx: DatabaseClient = db,
  ): Promise<LedgerRowWithRun[]> {
    const o = broadcastRecurrenceOccurrenceModel
    const rows = await tx
      .select({
        occurrence: o,
        run: {
          id: broadcastModel.id,
          status: broadcastModel.status,
          contactCount: broadcastModel.contactCount,
        },
      })
      .from(o)
      .leftJoin(broadcastModel, eq(broadcastModel.id, o.childBroadcastId))
      .where(
        and(
          eq(o.recurrenceId, input.recurrenceId),
          input.from ? sql`${o.occurrenceAt} >= ${input.from}` : undefined,
          input.to ? sql`${o.occurrenceAt} < ${input.to}` : undefined,
          input.cursor
            ? sql`(${o.occurrenceAt}, ${o.id}) < (${input.cursor.occurrenceAt}, ${input.cursor.id})`
            : undefined,
        ),
      )
      .orderBy(desc(o.occurrenceAt), desc(o.id))
      .limit(input.limit)

    return rows.map(({ occurrence, run }) => ({
      ...occurrence,
      run: run?.id ? run : null,
    }))
  },
}
