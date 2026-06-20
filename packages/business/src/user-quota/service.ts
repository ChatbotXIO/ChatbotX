import { db, eq, sql } from "@chatbotx.io/database/client"
import { userQuotaModel } from "@chatbotx.io/database/schema"
import type { UserQuotaModel } from "@chatbotx.io/database/types"
import { cacheConnections, distributedStore } from "@chatbotx.io/redis"
import { BaseService } from "../base.service"
import { logger } from "../logger"

export type QuotaMetric =
  | "workspaces"
  | "channels"
  | "teamMembers"
  | "contacts"
  | "mac"

const CACHE_TTL = 60 // seconds

class UserQuotaService extends BaseService {
  private cacheKey(userId: string) {
    return `user-quota:${userId}`
  }

  private liveKey(userId: string) {
    return `user-quota-live:${userId}`
  }

  private counterField(metric: QuotaMetric): string {
    return metric
  }

  private getUsedValue(
    quota: UserQuotaModel | null,
    metric: QuotaMetric,
  ): number {
    if (!quota) {
      return 0
    }
    switch (metric) {
      case "contacts":
        return quota.contactsUsed
      case "workspaces":
        return quota.workspacesUsed
      case "channels":
        return quota.channelsUsed
      case "teamMembers":
        return quota.teamMembersUsed
      case "mac":
        return quota.macUsed
      default:
        return 0
    }
  }

  private async getLiveCount(
    userId: string,
    metric: QuotaMetric,
  ): Promise<number> {
    try {
      const client = await cacheConnections.useExisting()
      const field = this.counterField(metric)
      const key = this.liveKey(userId)

      const value = await client.hget(key, field)
      if (value !== null) {
        return Number(value)
      }

      // Cold start: seed from DB so HINCRBY doesn't start from 0 for existing users
      const quota = await db.query.userQuotaModel.findFirst({
        where: { userId },
      })
      const dbValue = this.getUsedValue(quota ?? null, metric)

      // Atomic set-if-not-exists to handle concurrent cold starts
      await client.hsetnx(key, field, String(dbValue))

      const seeded = await client.hget(key, field)
      return seeded === null ? dbValue : Number(seeded)
    } catch (err) {
      logger.warn(
        { err },
        "user-quota: getLiveCount failed, falling back to DB",
      )
      const quota = await db.query.userQuotaModel.findFirst({
        where: { userId },
      })
      return this.getUsedValue(quota ?? null, metric)
    }
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

  /**
   * Tear down the white-label / enterprise entitlement flags on a reseller's
   * quota row when they downgrade to a non-white-label plan. Flips the flags
   * only — the new plan's numeric limit columns are (re)written separately by
   * the billing layer (`publishEntitlements`); nulling them here would mean
   * unlimited, the opposite of a downgrade. Busts the cache so enforcement
   * reads the new flags immediately. No-op if the row does not exist.
   */
  async clearWhiteLabelEntitlements(userId: string): Promise<void> {
    await db
      .update(userQuotaModel)
      .set({
        whiteLabel: false,
        ssoSaml: false,
        saasMode: false,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(userQuotaModel.userId, userId))
    await this.cacheDelete(userId)
  }

  async isLimitReached(userId: string, metric: QuotaMetric): Promise<boolean> {
    const [quota, liveCount] = await Promise.all([
      this.getForUser(userId),
      this.getLiveCount(userId, metric),
    ])
    if (!quota) {
      return false
    }
    const { limit } = this.readMetricValues(quota, metric)
    return limit !== null && liveCount >= limit
  }

  async getRemainingSlots(
    userId: string,
    metric: QuotaMetric,
  ): Promise<number | null> {
    const [quota, liveCount] = await Promise.all([
      this.getForUser(userId),
      this.getLiveCount(userId, metric),
    ])
    if (!quota) {
      return null
    }
    const { limit } = this.readMetricValues(quota, metric)
    if (limit === null) {
      return null
    }
    return Math.max(0, limit - liveCount)
  }

  async increment(userId: string, metric: QuotaMetric): Promise<void> {
    await this.incrementBy(userId, metric, 1)
  }

  async incrementBy(
    userId: string,
    metric: QuotaMetric,
    count: number,
  ): Promise<void> {
    if (count <= 0) {
      return
    }
    try {
      const client = await cacheConnections.useExisting()
      // getLiveCount seeds the key if missing so HINCRBY starts from the correct base
      await this.getLiveCount(userId, metric)
      await client.hincrby(
        this.liveKey(userId),
        this.counterField(metric),
        count,
      )
    } catch (err) {
      logger.warn(
        { err },
        `user-quota: Redis increment failed for ${metric}, counter will reconcile on next sync`,
      )
    }
  }

  /** Configured limit for a metric (`null` = unlimited / no quota row). */
  async getLimit(userId: string, metric: QuotaMetric): Promise<number | null> {
    const quota = await this.getForUser(userId)
    if (!quota) {
      return null
    }
    return this.readMetricValues(quota, metric).limit
  }

  /**
   * Whether there is room to create one more of `metric`, based on the
   * DB-synced `used` value (not the live Redis counter). This mirrors the
   * historical `tryIncrement` gate and is used for the synchronous create
   * paths (workspaces, channels, team members).
   */
  async hasCapacity(userId: string, metric: QuotaMetric): Promise<boolean> {
    const quota = await this.getForUser(userId)
    if (!quota) {
      return true
    }
    const { limit, used } = this.readMetricValues(quota, metric)
    return limit === null || used < limit
  }

  /** Persist a +1 usage increment to the DB row and invalidate the row cache. */
  async consume(userId: string, metric: QuotaMetric): Promise<void> {
    await this.upsertMetric(userId, metric)
    await this.cacheDelete(userId)
  }

  async tryIncrement(userId: string, metric: QuotaMetric): Promise<boolean> {
    if (!(await this.hasCapacity(userId, metric))) {
      return false
    }
    await this.consume(userId, metric)
    return true
  }

  /**
   * Pure read of a metric's configured limit + DB-synced used value from a
   * quota row (`null` row → unlimited/unused). Exposed for the level-aware
   * usage-summary display in `QuotaEnforcementService`.
   */
  metricValues(
    quota: UserQuotaModel | null,
    metric: QuotaMetric,
  ): { limit: number | null; used: number } {
    if (!quota) {
      return { limit: null, used: 0 }
    }
    return this.readMetricValues(quota, metric)
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
      case "contacts":
        return { limit: quota.contactsLimit, used: quota.contactsUsed }
      case "mac":
        return { limit: quota.macLimit, used: quota.macUsed }
      default:
        return { limit: null, used: 0 }
    }
  }

  private async upsertMetric(
    userId: string,
    metric: QuotaMetric,
  ): Promise<void> {
    if (metric === "workspaces") {
      await db
        .insert(userQuotaModel)
        .values({ userId, workspacesUsed: 1, syncedAt: new Date() })
        .onConflictDoUpdate({
          target: userQuotaModel.userId,
          set: {
            workspacesUsed: sql`${userQuotaModel.workspacesUsed} + 1`,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          },
        })
    } else if (metric === "channels") {
      await db
        .insert(userQuotaModel)
        .values({ userId, channelsUsed: 1, syncedAt: new Date() })
        .onConflictDoUpdate({
          target: userQuotaModel.userId,
          set: {
            channelsUsed: sql`${userQuotaModel.channelsUsed} + 1`,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          },
        })
    } else if (metric === "teamMembers") {
      await db
        .insert(userQuotaModel)
        .values({ userId, teamMembersUsed: 1, syncedAt: new Date() })
        .onConflictDoUpdate({
          target: userQuotaModel.userId,
          set: {
            teamMembersUsed: sql`${userQuotaModel.teamMembersUsed} + 1`,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          },
        })
    } else if (metric === "mac") {
      await db
        .insert(userQuotaModel)
        .values({ userId, macUsed: 1, syncedAt: new Date() })
        .onConflictDoUpdate({
          target: userQuotaModel.userId,
          set: {
            macUsed: sql`${userQuotaModel.macUsed} + 1`,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          },
        })
    } else {
      await db
        .insert(userQuotaModel)
        .values({ userId, contactsUsed: 1, syncedAt: new Date() })
        .onConflictDoUpdate({
          target: userQuotaModel.userId,
          set: {
            contactsUsed: sql`${userQuotaModel.contactsUsed} + 1`,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          },
        })
    }
  }
}

export const userQuotaService = new UserQuotaService()
