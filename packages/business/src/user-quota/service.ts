import { db, sql } from "@chatbotx.io/database/client"
import { userQuotaModel } from "@chatbotx.io/database/schema"
import type { UserQuotaModel } from "@chatbotx.io/database/types"
import { distributedStore } from "@chatbotx.io/redis"
import { BaseService } from "../base.service"
import { logger } from "../logger"

export type QuotaMetric = "workspaces" | "channels" | "teamMembers"
// TODO: MAC/contacts counting implemented in separate PR

const CACHE_TTL = 60 // seconds

class UserQuotaService extends BaseService {
  private cacheKey(userId: string) {
    return `user-quota:${userId}`
  }

  private async cacheGet(userId: string): Promise<UserQuotaModel | null> {
    try {
      return await distributedStore.get<UserQuotaModel>(this.cacheKey(userId))
    } catch (err) {
      logger.warn({ err }, "user-quota: Redis read failed, falling back to DB")
      return null
    }
  }

  private async cachePut(quota: UserQuotaModel): Promise<void> {
    try {
      await distributedStore.put(this.cacheKey(quota.userId), quota, CACHE_TTL)
    } catch (err) {
      logger.warn(
        { err },
        "user-quota: Redis write failed, continuing without cache",
      )
    }
  }

  private async cacheDelete(userId: string): Promise<void> {
    try {
      await distributedStore.delete(this.cacheKey(userId))
    } catch (err) {
      logger.warn(
        { err },
        "user-quota: Redis delete failed, stale cache may persist until TTL",
      )
    }
  }

  async getForUser(userId: string): Promise<UserQuotaModel | null> {
    const cached = await this.cacheGet(userId)
    if (cached) {
      return cached
    }

    const quota = await db.query.userQuotaModel.findFirst({ where: { userId } })
    if (quota) {
      await this.cachePut(quota)
    }
    return quota ?? null
  }

  async tryIncrement(userId: string, metric: QuotaMetric): Promise<boolean> {
    const quota = await this.getForUser(userId)

    if (quota) {
      const { limit, used } = this.readMetricValues(quota, metric)
      if (limit !== null && used >= limit) {
        return false
      }
    }

    await this.upsertMetric(userId, metric, "increment")
    await this.cacheDelete(userId)

    return true
  }

  async decrement(userId: string, metric: QuotaMetric): Promise<void> {
    const exists = await db.query.userQuotaModel.findFirst({
      where: { userId },
      columns: { userId: true },
    })
    if (!exists) {
      return
    }

    await this.upsertMetric(userId, metric, "decrement")
    await this.cacheDelete(userId)
  }

  private readMetricValues(
    quota: UserQuotaModel,
    metric: QuotaMetric,
  ): { limit: number | null; used: number } {
    switch (metric) {
      case "workspaces":
        return { limit: quota.workspacesLimit, used: quota.workspacesUsed }
      case "channels":
        return { limit: quota.channelsLimit, used: quota.channelsUsed }
      case "teamMembers":
        return { limit: quota.teamMembersLimit, used: quota.teamMembersUsed }
      default:
        return { limit: null, used: 0 }
    }
  }

  private async upsertMetric(
    userId: string,
    metric: QuotaMetric,
    direction: "increment" | "decrement",
  ): Promise<void> {
    const inc = direction === "increment"
    const initialUsed = inc ? 1 : 0

    if (metric === "workspaces") {
      await db
        .insert(userQuotaModel)
        .values({ userId, workspacesUsed: initialUsed, syncedAt: new Date() })
        .onConflictDoUpdate({
          target: userQuotaModel.userId,
          set: {
            workspacesUsed: inc
              ? sql`${userQuotaModel.workspacesUsed} + 1`
              : sql`GREATEST(0, ${userQuotaModel.workspacesUsed} - 1)`,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          },
        })
    } else if (metric === "channels") {
      await db
        .insert(userQuotaModel)
        .values({ userId, channelsUsed: initialUsed, syncedAt: new Date() })
        .onConflictDoUpdate({
          target: userQuotaModel.userId,
          set: {
            channelsUsed: inc
              ? sql`${userQuotaModel.channelsUsed} + 1`
              : sql`GREATEST(0, ${userQuotaModel.channelsUsed} - 1)`,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          },
        })
    } else {
      await db
        .insert(userQuotaModel)
        .values({ userId, teamMembersUsed: initialUsed, syncedAt: new Date() })
        .onConflictDoUpdate({
          target: userQuotaModel.userId,
          set: {
            teamMembersUsed: inc
              ? sql`${userQuotaModel.teamMembersUsed} + 1`
              : sql`GREATEST(0, ${userQuotaModel.teamMembersUsed} - 1)`,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          },
        })
    }
  }
}

export const userQuotaService = new UserQuotaService()
