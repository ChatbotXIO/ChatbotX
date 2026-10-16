import { db, sql } from "../client"
import { addUtcMonths, partitionExists } from "./mac-partitions"

/**
 * DDL helpers for the `maintainLeaderboardPartitions` cron. The monthly
 * partitions of `LeaderboardScoreEvent` are bounded with explicit `+00`
 * offsets because the partition key is timestamptz — a bare date literal is
 * read in the session time zone and would misalign the months.
 */

const PARENT_TABLE = "LeaderboardScoreEvent"
const PARTITION_NAME_PATTERN = /^LeaderboardScoreEvent_(\d{4})_(\d{2})$/

export function formatLeaderboardPartitionName(monthStart: Date): string {
  const year = monthStart.getUTCFullYear()
  const month = String(monthStart.getUTCMonth() + 1).padStart(2, "0")
  return `${PARENT_TABLE}_${year}_${month}`
}

const toUtcBound = (date: Date): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01 00:00:00+00`

/** Creates the monthly partition starting at `monthStart` (UTC). Returns whether it was created. */
export async function createLeaderboardScoreEventPartition(
  monthStart: Date,
): Promise<boolean> {
  const name = formatLeaderboardPartitionName(monthStart)
  if (await partitionExists(name)) {
    return false
  }
  const nextMonth = addUtcMonths(monthStart, 1)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${sql.identifier(name)}
    PARTITION OF ${sql.identifier(PARENT_TABLE)}
    FOR VALUES FROM (${sql.raw(`'${toUtcBound(monthStart)}'`)}) TO (${sql.raw(`'${toUtcBound(nextMonth)}'`)})
  `)
  return true
}

/** Monthly partitions currently attached, oldest first, with their month start. */
export async function listLeaderboardScoreEventPartitions(): Promise<
  { name: string; monthStart: Date }[]
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
      if (!match) {
        return null
      }
      return {
        name: row.name,
        monthStart: new Date(
          Date.UTC(Number(match[1]), Number(match[2]) - 1, 1),
        ),
      }
    })
    .filter((row): row is { name: string; monthStart: Date } => row !== null)
    .sort((a, b) => a.monthStart.getTime() - b.monthStart.getTime())
}

/**
 * Detaches then drops one monthly partition — removes a whole month without a
 * row-by-row DELETE. `DETACH ... CONCURRENTLY` cannot run inside a
 * transaction block, so each statement runs on its own.
 */
export async function dropLeaderboardScoreEventPartition(
  name: string,
): Promise<void> {
  if (!PARTITION_NAME_PATTERN.test(name)) {
    throw new Error(`Refusing to drop non-leaderboard partition: ${name}`)
  }
  await db.execute(sql`
    ALTER TABLE ${sql.identifier(PARENT_TABLE)}
    DETACH PARTITION ${sql.identifier(name)} CONCURRENTLY
  `)
  await db.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(name)}`)
}

/** Rows that fell into the DEFAULT partition — non-zero means the cron missed a month. */
export async function countLeaderboardScoreEventDefaultRows(): Promise<number> {
  const result = await db.execute<{ total: number }>(sql`
    SELECT count(*)::int AS "total" FROM "LeaderboardScoreEvent_default"
  `)
  return Number(result.rows[0]?.total ?? 0)
}
