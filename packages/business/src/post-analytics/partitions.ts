import {
  addUtcMonths,
  channelPostMetricRepository,
} from "@chatbotx.io/database/repositories"
import {
  POST_METRIC_PARTITION_MONTHS_AHEAD,
  POST_METRIC_RETENTION_MONTHS,
} from "@chatbotx.io/utils/post-metrics"
import { logger } from "../logger"

const startOfUtcMonth = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))

export type ChannelPostMetricMaintenanceResult = {
  created: string[]
  defaultRows: number
  dropped: string[]
  failed: string[]
  /** Months whose rows were moved out of the DEFAULT partition into a new partition. */
  healed: string[]
  /** Rows deleted from the DEFAULT partition because their day is past the retention. */
  purgedDefaultRows: number
}

/**
 * Rows of any older month stay in the DEFAULT partition when their month's
 * partition was never created. Every such month inside the retention gets its
 * partition (the repository moves the rows into it); rows of days past the
 * retention are deleted, since no partition for them would survive a drop.
 */
async function healDefaultPartition(
  keepFrom: Date,
  alreadyTried: ReadonlySet<string>,
  failed: string[],
): Promise<{ healed: string[]; purgedDefaultRows: number }> {
  const healed: string[] = []
  let purgedDefaultRows = 0
  try {
    purgedDefaultRows =
      await channelPostMetricRepository.deleteDefaultRowsBefore(keepFrom)
    for (const month of await channelPostMetricRepository.listDefaultMonths()) {
      const label = month.toISOString().slice(0, 7)
      if (month < keepFrom || alreadyTried.has(label)) {
        continue
      }
      try {
        if (await channelPostMetricRepository.createPartition(month)) {
          healed.push(label)
        }
      } catch (err) {
        failed.push(label)
        logger.error(
          { err, month: label },
          "channel post metric default partition repair failed",
        )
      }
    }
  } catch (err) {
    logger.error({ err }, "channel post metric default partition scan failed")
  }
  return { healed, purgedDefaultRows }
}

/**
 * Keeps `ChannelPostMetricDaily` partitions ahead of incoming data and drops
 * the months past retention (a whole partition at a time, never a row-by-row
 * delete). A partition is dropped only when its whole month is older than the
 * retention, so a day inside the window is never lost. System maintenance, not
 * workspace-scoped, so no blocked-owner guard.
 */
export async function maintainChannelPostMetricPartitions(
  now: Date = new Date(),
): Promise<ChannelPostMetricMaintenanceResult> {
  const currentMonth = startOfUtcMonth(now)
  const created: string[] = []
  const failed: string[] = []
  // From the previous month: a day near a month boundary can still be written
  // there, and the DEFAULT partition must never hold a month that is missing.
  for (let i = -1; i <= POST_METRIC_PARTITION_MONTHS_AHEAD; i++) {
    const month = addUtcMonths(currentMonth, i)
    try {
      if (await channelPostMetricRepository.createPartition(month)) {
        created.push(month.toISOString().slice(0, 7))
      }
    } catch (err) {
      // One month failing must not stop the other months or the retention.
      failed.push(month.toISOString().slice(0, 7))
      logger.error(
        { err, month: month.toISOString().slice(0, 7) },
        "channel post metric partition create failed",
      )
    }
  }

  const keepFrom = addUtcMonths(currentMonth, -POST_METRIC_RETENTION_MONTHS)
  const dropped: string[] = []
  for (const partition of await channelPostMetricRepository.listPartitions()) {
    if (partition.monthStart >= keepFrom) {
      continue
    }
    try {
      await channelPostMetricRepository.dropPartition(partition.name)
      dropped.push(partition.name)
    } catch (err) {
      logger.error(
        { err, partition: partition.name },
        "channel post metric partition drop failed",
      )
    }
  }

  const { healed, purgedDefaultRows } = await healDefaultPartition(
    keepFrom,
    new Set(created.concat(failed)),
    failed,
  )

  const defaultRows = await channelPostMetricRepository.countDefaultRows()
  if (defaultRows > 0) {
    logger.warn(
      { defaultRows, failed },
      "ChannelPostMetricDaily_default holds rows: a monthly partition was missing",
    )
  }
  logger.info(
    { created, defaultRows, dropped, failed, healed, purgedDefaultRows },
    "channel post metric partitions maintained",
  )
  return { created, defaultRows, dropped, failed, healed, purgedDefaultRows }
}
