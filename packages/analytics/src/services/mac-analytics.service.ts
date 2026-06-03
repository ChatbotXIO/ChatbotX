import { db } from "@chatbotx.io/database/client"
import { distributedStore } from "@chatbotx.io/redis"
import { logger } from "../lib/logger"
import { calcEndOfDayTtl, workspaceMacCacheKey } from "../lib/mac-period"
import { macRepository } from "../repositories/postgres/mac.repository"
import type { ReconcilePeriodInput } from "../schemas/mac"

async function readOrPopulate(
  cacheKey: string,
  load: () => Promise<number>,
): Promise<number> {
  try {
    const cached = await distributedStore.getNumber(cacheKey)
    if (cached !== null) {
      return cached
    }
  } catch (error) {
    logger.error(error, "[MacAnalyticsService] cache get failed")
  }

  const macCount = await load()

  try {
    await distributedStore.setNumberIfNotExists(
      cacheKey,
      macCount,
      calcEndOfDayTtl(),
    )
  } catch (error) {
    logger.error(error, "[MacAnalyticsService] cache populate failed")
  }

  return macCount
}

export class MacAnalyticsService {
  async getActiveContactCountByWorkspaceId(input: {
    workspaceId: string
  }): Promise<number> {
    return await readOrPopulate(
      workspaceMacCacheKey(input.workspaceId),
      async () => {
        const { macCount } =
          await macRepository.getActiveContactCountByWorkspaceId(input)
        return macCount
      },
    )
  }

  reconcilePeriod(input: ReconcilePeriodInput): Promise<void> {
    return db.transaction((tx) => macRepository.reconcilePeriod(input, tx))
  }
}

export const macAnalyticsService = new MacAnalyticsService()
