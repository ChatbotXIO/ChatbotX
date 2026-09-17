import {
  addUtcMonths,
  createContactActiveHourlyPartition,
  createContactActiveMonthlyPartition,
} from "@chatbotx.io/database/repositories"
import { logger } from "../../lib/logger"

// Keeps the MAC partition trees ahead of incoming data. `ContactActiveMonthly`
// is partitioned yearly by `periodStart`; `ContactActiveHourly` is partitioned
// monthly by `hourBucket` so dashboard range scans can prune partitions.
const CONFIG = {
  hourlyMonthsAhead: 2,
  yearlyPartitionsAhead: 1,
} as const

export async function maintainMacPartitions(): Promise<void> {
  const now = new Date()
  const currentMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  )
  let createdYearly = 0
  let createdHourly = 0

  try {
    for (let i = 0; i <= CONFIG.yearlyPartitionsAhead; i++) {
      if (await createContactActiveMonthlyPartition(now.getUTCFullYear() + i)) {
        createdYearly++
      }
    }

    for (let i = 0; i <= CONFIG.hourlyMonthsAhead; i++) {
      if (
        await createContactActiveHourlyPartition(addUtcMonths(currentMonth, i))
      ) {
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
