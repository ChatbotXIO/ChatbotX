import { db, sql } from "../client"

/**
 * DDL helpers for `maintain-mac-partitions.ts` (the `schedule:maintain-mac-
 * partitions` cron). Moved verbatim from the handler — this is raw `CREATE
 * TABLE ... PARTITION OF` DDL with `sql.raw` date literals; do not "improve"
 * the parameterisation or add a transaction/advisory lock that isn't here
 * today, behaviour must stay identical.
 */

export async function partitionExists(name: string): Promise<boolean> {
  const result = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (SELECT 1 FROM pg_class WHERE relname = ${name}) AS "exists"
  `)
  return result.rows[0]?.exists ?? false
}

/** Yearly partition for `ContactActiveMonthly`. Returns whether it was created. */
export async function createContactActiveMonthlyPartition(
  year: number,
): Promise<boolean> {
  const name = `ContactActiveMonthly_${year}`
  if (await partitionExists(name)) {
    return false
  }

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${sql.identifier(name)}
    PARTITION OF "ContactActiveMonthly"
    FOR VALUES FROM (${sql.raw(`'${year}-01-01'`)}) TO (${sql.raw(`'${year + 1}-01-01'`)})
  `)
  return true
}

export function addUtcMonths(date: Date, months: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1),
  )
}

export function formatMonthlyPartitionName(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  return `ContactActiveHourly_${year}_${month}`
}

export function formatUtcDate(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}-01`
}

/** Monthly partition for `ContactActiveHourly`. Returns whether it was created. */
export async function createContactActiveHourlyPartition(
  monthStart: Date,
): Promise<boolean> {
  const name = formatMonthlyPartitionName(monthStart)
  if (await partitionExists(name)) {
    return false
  }

  const nextMonth = addUtcMonths(monthStart, 1)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${sql.identifier(name)}
    PARTITION OF "ContactActiveHourly"
    FOR VALUES FROM (${sql.raw(`'${formatUtcDate(monthStart)}'`)}) TO (${sql.raw(`'${formatUtcDate(nextMonth)}'`)})
  `)
  return true
}
