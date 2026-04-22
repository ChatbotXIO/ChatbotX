import { distributedStore } from "@chatbotx.io/redis"
import { logger } from "../lib/logger"
import { calcEndOfDayTtl, macCountCacheKey } from "../lib/mac-period"
import { macRepository } from "../repositories/mac.repository"
import type {
  GetBreakdownInput,
  GetPeriodTotalInput,
  GetPeriodTotalOutput,
  MacCountCacheValue,
  MacTrendPoint,
  ReconcilePeriodInput,
} from "../schemas/mac"

export class MacAnalyticsService {
  async getActiveContactCount(
    input: GetPeriodTotalInput,
  ): Promise<GetPeriodTotalOutput> {
    const cacheKey = macCountCacheKey(input.workspaceId, input.billingId)

    try {
      const cached = await distributedStore.get<MacCountCacheValue>(cacheKey)
      if (cached) {
        return cached
      }
    } catch (error) {
      logger.error(
        error,
        "[MacAnalyticsService] cache get failed for mac count",
      )
    }

    const result = await macRepository.getActiveContactCount(input)

    if (result.periodStart) {
      try {
        await distributedStore.put(
          cacheKey,
          result satisfies MacCountCacheValue,
          calcEndOfDayTtl(),
        )
      } catch (error) {
        logger.error(
          error,
          "[MacAnalyticsService] cache set failed for mac count",
        )
      }
    }

    return result
  }

  getDailyBreakdown(input: GetBreakdownInput): Promise<MacTrendPoint[]> {
    return macRepository.getDailyBreakdown(input)
  }

  reconcilePeriod(input: ReconcilePeriodInput): Promise<void> {
    return macRepository.reconcilePeriod(input)
  }
}

export const macAnalyticsService = new MacAnalyticsService()
