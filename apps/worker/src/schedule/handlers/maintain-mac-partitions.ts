import { db, sql } from "@chatbotx.io/database/client"
import { logger } from "../../lib/logger"

// Keeps the MAC partition trees ahead of incoming data. `ContactActiveMonthly`
// is partitioned yearly by `periodStart`; `ContactActiveHourly` is partitioned
// monthly by `hourBucket` so dashboard range scans can prune partitions.
const CONFIG = {
  hourlyMonthsAhead: 2,
  yearlyPartitionsAhead: 1,
} as const

async function partitionExists(name: string): Promise<boolean> {
  const result = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (SELECT 1 FROM pg_class WHERE relname = ${name}) AS "exists"
  `)
  return result.rows[0]?.exists ?? false
}

async function createYearlyPartition(year: number): Promise<boolean> {
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

function addUtcMonths(date: Date, months: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1),
  )
}

function formatMonthlyPartitionName(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  return `ContactActiveHourly_${year}_${month}`
}

function formatUtcDate(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}-01`
}

async function createHourlyMonthlyPartition(
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

export async function maintainMacPartitions(): Promise<void> {
  const now = new Date()
  const currentMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  )
  let createdYearly = 0
  let createdHourly = 0

  try {
    for (let i = 0; i <= CONFIG.yearlyPartitionsAhead; i++) {
      if (await createYearlyPartition(now.getUTCFullYear() + i)) {
        createdYearly++
      }
    }

    for (let i = 0; i <= CONFIG.hourlyMonthsAhead; i++) {
      if (await createHourlyMonthlyPartition(addUtcMonths(currentMonth, i))) {
        createdHourly++
      }
    }

    logger.info(
      `[maintainMacPartitions] yearlyCreated=${createdYearly} hourlyCreated=${createdHourly}`,
    )
  } catch (error) {
    logger.error(error, "[maintainMacPartitions] failed")
  }
}
