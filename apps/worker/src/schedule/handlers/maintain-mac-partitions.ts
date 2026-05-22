import { db, sql } from "@chatbotx.io/database/client"
import { logger } from "../../lib/logger"

// Keeps the `ContactActiveMonthly` partition tree ahead of incoming data. The
// table is partitioned yearly by `periodStart`; this cron pre-creates the
// current year + N years ahead so a new row never lands in the default
// partition. The hourly activity table was removed, so there is nothing to
// drop here — yearly partitions are cheap and retained indefinitely.
const CONFIG = {
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

export async function maintainMacPartitions(): Promise<void> {
  const now = new Date()
  let created = 0

  try {
    for (let i = 0; i <= CONFIG.yearlyPartitionsAhead; i++) {
      if (await createYearlyPartition(now.getUTCFullYear() + i)) {
        created++
      }
    }

    logger.info(`[maintainMacPartitions] created=${created}`)
  } catch (error) {
    logger.error(error, "[maintainMacPartitions] failed")
  }
}
