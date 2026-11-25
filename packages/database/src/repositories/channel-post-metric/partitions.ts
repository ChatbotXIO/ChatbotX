import { db, sql } from "../../client"
import { addUtcMonths, partitionExists } from "../mac-partitions"

/**
 * DDL helpers for the `maintainChannelPostMetricPartitions` cron. The monthly
 * partitions of `ChannelPostMetricDaily` are keyed by `day` (a `date`), so the
 * bounds are plain first-of-month dates, never a timestamp.
 */

const PARENT_TABLE = "ChannelPostMetricDaily"
const DEFAULT_PARTITION = "ChannelPostMetricDaily_default"
const PARTITION_NAME_PATTERN = /^ChannelPostMetricDaily_(\d{4})_(\d{2})$/

export type ChannelPostMetricPartition = { monthStart: Date; name: string }

export function formatChannelPostMetricPartitionName(monthStart: Date): string {
  const year = monthStart.getUTCFullYear()
  const month = String(monthStart.getUTCMonth() + 1).padStart(2, "0")
  return `${PARENT_TABLE}_${year}_${month}`
}

const toDateBound = (date: Date): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`

/** How long a partition create waits for the table locks before giving up until the next run. */
const CREATE_LOCK_TIMEOUT = "10s"
/** Bounds the whole repair: lock_timeout does not limit the time moving the rows takes. */
const CREATE_STATEMENT_TIMEOUT = "60s"

const DAILY_COLUMN_LIST = `"workspaceId", "day", "channelPostId", "inboxId", "channel", "commentsCount", "reactionsCount", "sharesCount", "engagementCount", "viewsCount", "commentsGain", "reactionsGain", "sharesGain", "engagementGain", "viewsGain", "isBaseline", "observedAt"`

/**
 * Creates the monthly partition starting at `monthStart` (UTC). Returns whether
 * it was created.
 *
 * PostgreSQL refuses to create a partition while the DEFAULT partition holds
 * rows of that month. In one transaction with a short lock timeout and a
 * statement timeout, the PARENT is locked first (ACCESS EXCLUSIVE, the same
 * order writers take their locks in: parent, then partition; locking the
 * DEFAULT partition first and the parent second could deadlock against an
 * `INSERT ... ON CONFLICT`), the month's rows are moved out of the DEFAULT
 * partition into a temporary table, the partition is created and the rows are
 * inserted back (now routed into it). A failure rolls everything back, so no
 * row is lost, the error reaches the caller (which logs it) and the next run
 * tries again.
 */
export async function createChannelPostMetricPartition(
  monthStart: Date,
): Promise<boolean> {
  const name = formatChannelPostMetricPartitionName(monthStart)
  if (await partitionExists(name)) {
    return false
  }
  const from = toDateBound(monthStart)
  const to = toDateBound(addUtcMonths(monthStart, 1))
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('lock_timeout', ${CREATE_LOCK_TIMEOUT}, true)`,
    )
    await tx.execute(
      sql`SELECT set_config('statement_timeout', ${CREATE_STATEMENT_TIMEOUT}, true)`,
    )
    await tx.execute(
      sql`LOCK TABLE ${sql.identifier(PARENT_TABLE)} IN ACCESS EXCLUSIVE MODE`,
    )
    await tx.execute(sql`
      CREATE TEMP TABLE "ChannelPostMetricDaily_heal" ON COMMIT DROP AS
      WITH moved AS (
        DELETE FROM ${sql.identifier(DEFAULT_PARTITION)}
        WHERE "day" >= ${from}::date AND "day" < ${to}::date
        RETURNING ${sql.raw(DAILY_COLUMN_LIST)}
      )
      SELECT * FROM moved
    `)
    await tx.execute(sql`
      CREATE TABLE IF NOT EXISTS ${sql.identifier(name)}
      PARTITION OF ${sql.identifier(PARENT_TABLE)}
      FOR VALUES FROM (${sql.raw(`'${from}'`)}) TO (${sql.raw(`'${to}'`)})
    `)
    await tx.execute(sql`
      INSERT INTO ${sql.identifier(PARENT_TABLE)} (${sql.raw(DAILY_COLUMN_LIST)})
      SELECT ${sql.raw(DAILY_COLUMN_LIST)} FROM "ChannelPostMetricDaily_heal"
    `)
  })
  return true
}

/** Monthly partitions currently attached, oldest first. */
export async function listChannelPostMetricPartitions(): Promise<
  ChannelPostMetricPartition[]
> {
  const result = await db.execute<{ name: string }>(sql`
    SELECT c.relname AS "name"
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    WHERE p.relname = ${PARENT_TABLE}
  `)
  return result.rows
    .map((row) => {
      const match = PARTITION_NAME_PATTERN.exec(row.name)
      return match
        ? {
            monthStart: new Date(
              Date.UTC(Number(match[1]), Number(match[2]) - 1, 1),
            ),
            name: row.name,
          }
        : null
    })
    .filter((row): row is ChannelPostMetricPartition => row !== null)
    .sort((a, b) => a.monthStart.getTime() - b.monthStart.getTime())
}

/** How long a drop waits for the parent's lock before giving up until the next run. */
const DROP_LOCK_TIMEOUT = "10s"

/**
 * Detaches then drops one monthly partition: removes a month without a
 * row-by-row DELETE. `DETACH ... CONCURRENTLY` is not available while the
 * table has a DEFAULT partition (and this one always has), so the detach takes
 * a short lock on the parent inside one transaction with a lock timeout: if
 * writers hold the table for longer, the drop fails and the next daily run
 * tries again, and nothing is left half done.
 */
export async function dropChannelPostMetricPartition(
  name: string,
): Promise<void> {
  if (!PARTITION_NAME_PATTERN.test(name)) {
    throw new Error(`Refusing to drop a non-metric partition: ${name}`)
  }
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('lock_timeout', ${DROP_LOCK_TIMEOUT}, true)`,
    )
    await tx.execute(sql`
      ALTER TABLE ${sql.identifier(PARENT_TABLE)}
      DETACH PARTITION ${sql.identifier(name)}
    `)
    await tx.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(name)}`)
  })
}

/** Rows in the DEFAULT partition: non-zero means the cron missed a month. */
export async function countChannelPostMetricDefaultRows(): Promise<number> {
  const result = await db.execute<{ total: number }>(sql`
    SELECT count(*)::int AS "total" FROM ${sql.identifier(DEFAULT_PARTITION)}
  `)
  return Number(result.rows[0]?.total ?? 0)
}

/** Months (UTC month starts) that have rows in the DEFAULT partition, oldest first. */
export async function listChannelPostMetricDefaultMonths(): Promise<Date[]> {
  const result = await db.execute<{ month: string }>(sql`
    SELECT DISTINCT to_char(date_trunc('month', "day"), 'YYYY-MM-DD') AS "month"
    FROM ${sql.identifier(DEFAULT_PARTITION)}
    ORDER BY 1
  `)
  return result.rows.map((row) => new Date(`${row.month}T00:00:00.000Z`))
}

/** Deletes the DEFAULT partition's rows of months before the month of `before` (month granular, like the partitions; pass a month start). Returns the count. */
export async function deleteChannelPostMetricDefaultRowsBefore(
  before: Date,
): Promise<number> {
  const result = await db.execute<{ id: string }>(sql`
    WITH removed AS (
      DELETE FROM ${sql.identifier(DEFAULT_PARTITION)}
      WHERE "day" < ${toDateBound(before)}::date
      RETURNING 1
    )
    SELECT count(*)::int AS "id" FROM removed
  `)
  return Number(result.rows[0]?.id ?? 0)
}
