import { db, sql } from "@chatbotx.io/database/client"
import { addMonths, format, startOfMonth } from "date-fns"
import { logger } from "../../lib/logger"

const CONFIG = {
  hourlyPartitionsAhead: 6,
  hourlyRetentionMonths: 12,
  yearlyPartitionsAhead: 1,
} as const

const HOURLY_PARTITION_REGEX = /^ContactActivityHourly_(\d{4})_(\d{2})$/

async function partitionExists(name: string): Promise<boolean> {
  const result = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (SELECT 1 FROM pg_class WHERE relname = ${name}) AS "exists"
  `)
  return result.rows[0]?.exists ?? false
}

async function listPartitions(parent: string): Promise<string[]> {
  const result = await db.execute<{ relname: string }>(sql`
    SELECT c.relname
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    WHERE p.relname = ${parent}
  `)
  return result.rows.map((r) => r.relname)
}

async function defaultPartitionHasRows(parent: string): Promise<boolean> {
  const result = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (SELECT 1 FROM ${sql.identifier(`${parent}_default`)} LIMIT 1) AS "exists"
  `)
  return result.rows[0]?.exists ?? false
}

async function createHourlyPartition(month: Date): Promise<boolean> {
  const name = `ContactActivityHourly_${format(month, "yyyy_MM")}`
  if (await partitionExists(name)) {
    return false
  }

  const from = format(month, "yyyy-MM-dd")
  const to = format(addMonths(month, 1), "yyyy-MM-dd")

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${sql.identifier(name)}
    PARTITION OF "ContactActivityHourly"
    FOR VALUES FROM (${sql.raw(`'${from}'`)}) TO (${sql.raw(`'${to}'`)})
  `)
  return true
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

async function dropOldHourlyPartitions(now: Date): Promise<string[]> {
  if (await defaultPartitionHasRows("ContactActivityHourly")) {
    logger.warn(
      "[maintainMacPartitions] default partition has rows, skipping drops",
    )
    return []
  }

  const cutoff = startOfMonth(addMonths(now, -CONFIG.hourlyRetentionMonths))
  const partitions = await listPartitions("ContactActivityHourly")
  const dropped: string[] = []

  for (const name of partitions) {
    const match = HOURLY_PARTITION_REGEX.exec(name)
    if (!match) {
      continue
    }

    const partitionMonth = new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, 1),
    )
    if (partitionMonth >= cutoff) {
      continue
    }

    await db.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(name)}`)
    dropped.push(name)
  }

  return dropped
}

export async function maintainMacPartitions(): Promise<void> {
  const now = new Date()
  let created = 0

  try {
    for (let i = 0; i <= CONFIG.hourlyPartitionsAhead; i++) {
      if (await createHourlyPartition(startOfMonth(addMonths(now, i)))) {
        created++
      }
    }

    for (let i = 0; i <= CONFIG.yearlyPartitionsAhead; i++) {
      if (await createYearlyPartition(now.getUTCFullYear() + i)) {
        created++
      }
    }

    const dropped = await dropOldHourlyPartitions(now)

    logger.info(
      `[maintainMacPartitions] created=${created} dropped=${dropped.length}`,
    )
    if (dropped.length > 0) {
      logger.info(
        `[maintainMacPartitions] dropped partitions: ${dropped.join(", ")}`,
      )
    }
  } catch (error) {
    logger.error(error, "[maintainMacPartitions] failed")
  }
}
