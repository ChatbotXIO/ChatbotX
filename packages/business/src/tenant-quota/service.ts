import { and, count, db, eq, ne, sql } from "@chatbotx.io/database/client"
import {
  contactModel,
  tenantQuotaUsageModel,
  workspaceMemberModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import type { TenantQuotaUsageModel } from "@chatbotx.io/database/types"
import { cacheConnections, distributedStore } from "@chatbotx.io/redis"
import { BaseService } from "../base.service"
import { logger } from "../logger"
import { type QuotaMetric, userQuotaService } from "../user-quota/service"

const CACHE_TTL = 60 // seconds
const LIVE_KEY_PREFIX = "tenant-quota-live:"

/**
 * Pooled usage counters for a white-label tenant (reseller). Usage is the sum
 * of every customer's resources under the tenant; the *limit* is read from the
 * tenant owner's `UserQuota` row (written by the enterprise billing layer). The
 * Redis live-counter + high-water-mark reconciliation design mirrors
 * `UserQuotaService` so the two levels behave identically.
 */
class TenantQuotaService extends BaseService {
  private cacheKey(tenantId: string) {
    return `tenant-quota:${tenantId}`
  }

  private liveKey(tenantId: string) {
    return `${LIVE_KEY_PREFIX}${tenantId}`
  }

  private counterField(metric: QuotaMetric): string {
    return metric
  }

  /**
   * Pure read of a metric's pooled used value from a usage row. Exposed for the
   * level-aware usage-summary display in `QuotaEnforcementService`.
   */
  metricUsed(usage: TenantQuotaUsageModel | null, metric: QuotaMetric): number {
    return this.getUsedValue(usage, metric)
  }

  private getUsedValue(
    usage: TenantQuotaUsageModel | null,
    metric: QuotaMetric,
  ): number {
    if (!usage) {
      return 0
    }
    switch (metric) {
      case "contacts":
        return usage.contactsUsed
      case "workspaces":
        return usage.workspacesUsed
      case "channels":
        return usage.channelsUsed
      case "teamMembers":
        return usage.teamMembersUsed
      case "mac":
        return usage.macUsed
      default:
        return 0
    }
  }

  private async getLiveCount(
    tenantId: string,
    metric: QuotaMetric,
  ): Promise<number> {
    try {
      const client = await cacheConnections.useExisting()
      const field = this.counterField(metric)
      const key = this.liveKey(tenantId)

      const value = await client.hget(key, field)
      if (value !== null) {
        return Number(value)
      }

      // Cold start: seed from DB so HINCRBY doesn't start from 0 for tenants
      // that already have aggregate usage.
      const usage = await db.query.tenantQuotaUsageModel.findFirst({
        where: { tenantId },
      })
      const dbValue = this.getUsedValue(usage ?? null, metric)

      await client.hsetnx(key, field, String(dbValue))

      const seeded = await client.hget(key, field)
      return seeded === null ? dbValue : Number(seeded)
    } catch (err) {
      logger.warn(
        { err },
        "tenant-quota: getLiveCount failed, falling back to DB",
      )
      const usage = await db.query.tenantQuotaUsageModel.findFirst({
        where: { tenantId },
      })
      return this.getUsedValue(usage ?? null, metric)
    }
  }

  private async cacheGet(
    tenantId: string,
  ): Promise<TenantQuotaUsageModel | null> {
    try {
      return await distributedStore.get<TenantQuotaUsageModel>(
        this.cacheKey(tenantId),
      )
    } catch (err) {
      logger.warn(
        { err },
        "tenant-quota: Redis read failed, falling back to DB",
      )
      return null
    }
  }

  private async cachePut(usage: TenantQuotaUsageModel): Promise<void> {
    try {
      await distributedStore.put(
        this.cacheKey(usage.tenantId),
        usage,
        CACHE_TTL,
      )
    } catch (err) {
      logger.warn(
        { err },
        "tenant-quota: Redis write failed, continuing without cache",
      )
    }
  }

  private async cacheDelete(tenantId: string): Promise<void> {
    try {
      await distributedStore.delete(this.cacheKey(tenantId))
    } catch (err) {
      logger.warn(
        { err },
        "tenant-quota: Redis delete failed, stale cache may persist until TTL",
      )
    }
  }

  async getUsage(tenantId: string): Promise<TenantQuotaUsageModel | null> {
    const cached = await this.cacheGet(tenantId)
    if (cached) {
      return cached
    }

    const usage = await db.query.tenantQuotaUsageModel.findFirst({
      where: { tenantId },
    })
    if (usage) {
      await this.cachePut(usage)
    }
    return usage ?? null
  }

  /**
   * Whether the pool has room for one more of `metric`, based on the DB-synced
   * aggregate `used` value vs. the owner's configured limit. Mirrors
   * `userQuotaService.hasCapacity` for the synchronous create paths.
   */
  async hasCapacity(
    tenantId: string,
    ownerId: string,
    metric: QuotaMetric,
  ): Promise<boolean> {
    const [usage, limit] = await Promise.all([
      this.getUsage(tenantId),
      userQuotaService.getLimit(ownerId, metric),
    ])
    if (limit === null) {
      return true
    }
    return this.getUsedValue(usage, metric) < limit
  }

  /** Persist a +1 pooled usage increment to the DB row and bust the cache. */
  async consume(tenantId: string, metric: QuotaMetric): Promise<void> {
    await this.upsertMetric(tenantId, metric)
    await this.cacheDelete(tenantId)
  }

  /** Live-counter limit check (used by the high-frequency contact paths). */
  async isLimitReached(
    tenantId: string,
    ownerId: string,
    metric: QuotaMetric,
  ): Promise<boolean> {
    const [limit, liveCount] = await Promise.all([
      userQuotaService.getLimit(ownerId, metric),
      this.getLiveCount(tenantId, metric),
    ])
    return limit !== null && liveCount >= limit
  }

  async getRemainingSlots(
    tenantId: string,
    ownerId: string,
    metric: QuotaMetric,
  ): Promise<number | null> {
    const [limit, liveCount] = await Promise.all([
      userQuotaService.getLimit(ownerId, metric),
      this.getLiveCount(tenantId, metric),
    ])
    if (limit === null) {
      return null
    }
    return Math.max(0, limit - liveCount)
  }

  async increment(tenantId: string, metric: QuotaMetric): Promise<void> {
    await this.incrementBy(tenantId, metric, 1)
  }

  async incrementBy(
    tenantId: string,
    metric: QuotaMetric,
    count: number,
  ): Promise<void> {
    if (count <= 0) {
      return
    }
    try {
      const client = await cacheConnections.useExisting()
      // Seed the key if missing so HINCRBY starts from the correct base.
      await this.getLiveCount(tenantId, metric)
      await client.hincrby(
        this.liveKey(tenantId),
        this.counterField(metric),
        count,
      )
    } catch (err) {
      logger.warn(
        { err },
        `tenant-quota: Redis increment failed for ${metric}, counter will reconcile on next sync`,
      )
    }
  }

  /** Tenant ids with a live counter, for the reconciliation job to walk. */
  async listTrackedTenantIds(): Promise<string[]> {
    const client = await cacheConnections.useExisting()
    const tenantIds: string[] = []
    let cursor = "0"
    do {
      const [nextCursor, keys] = await client.scan(
        cursor,
        "MATCH",
        `${LIVE_KEY_PREFIX}*`,
        "COUNT",
        100,
      )
      cursor = nextCursor
      for (const key of keys) {
        tenantIds.push(key.slice(LIVE_KEY_PREFIX.length))
      }
    } while (cursor !== "0")
    return tenantIds
  }

  /**
   * Reconcile the pooled counters from the source-of-truth DB counts aggregated
   * across every workspace under the tenant. The GREATEST high-water-mark keeps
   * the stored value monotonic against live-counter drift (retried jobs / Redis
   * loss). Errors are logged and swallowed so one tenant can't fail the batch.
   */
  async reconcileFromDb(tenantId: string): Promise<void> {
    try {
      const client = await cacheConnections.useExisting()

      const [[contactsResult], [teamMembersResult]] = await Promise.all([
        db
          .select({ count: count() })
          .from(contactModel)
          .innerJoin(
            workspaceModel,
            eq(contactModel.workspaceId, workspaceModel.id),
          )
          .where(eq(workspaceModel.tenantId, tenantId)),

        db
          .select({ count: count() })
          .from(workspaceMemberModel)
          .innerJoin(
            workspaceModel,
            eq(workspaceMemberModel.workspaceId, workspaceModel.id),
          )
          .where(
            and(
              eq(workspaceModel.tenantId, tenantId),
              ne(workspaceMemberModel.role, "owner"),
            ),
          ),
      ])

      const contactsUsed = contactsResult?.count ?? 0
      const teamMembersUsed = teamMembersResult?.count ?? 0

      await db
        .insert(tenantQuotaUsageModel)
        .values({
          tenantId,
          contactsUsed,
          teamMembersUsed,
          syncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: tenantQuotaUsageModel.tenantId,
          set: {
            contactsUsed: sql`GREATEST(${tenantQuotaUsageModel.contactsUsed}, ${contactsUsed})`,
            teamMembersUsed: sql`GREATEST(${tenantQuotaUsageModel.teamMembersUsed}, ${teamMembersUsed})`,
            syncedAt: new Date(),
            updatedAt: sql`CURRENT_TIMESTAMP`,
          },
        })

      const stored = await db.query.tenantQuotaUsageModel.findFirst({
        where: { tenantId },
        columns: { contactsUsed: true, teamMembersUsed: true },
      })

      await client.hset(
        this.liveKey(tenantId),
        "contacts",
        String(stored?.contactsUsed ?? contactsUsed),
        "teamMembers",
        String(stored?.teamMembersUsed ?? teamMembersUsed),
      )

      await this.cacheDelete(tenantId)
    } catch (err) {
      logger.error(
        { err, tenantId },
        "tenant-quota: failed to reconcile tenant quota",
      )
    }
  }

  private async upsertMetric(
    tenantId: string,
    metric: QuotaMetric,
  ): Promise<void> {
    if (metric === "workspaces") {
      await db
        .insert(tenantQuotaUsageModel)
        .values({ tenantId, workspacesUsed: 1, syncedAt: new Date() })
        .onConflictDoUpdate({
          target: tenantQuotaUsageModel.tenantId,
          set: {
            workspacesUsed: sql`${tenantQuotaUsageModel.workspacesUsed} + 1`,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          },
        })
    } else if (metric === "channels") {
      await db
        .insert(tenantQuotaUsageModel)
        .values({ tenantId, channelsUsed: 1, syncedAt: new Date() })
        .onConflictDoUpdate({
          target: tenantQuotaUsageModel.tenantId,
          set: {
            channelsUsed: sql`${tenantQuotaUsageModel.channelsUsed} + 1`,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          },
        })
    } else if (metric === "teamMembers") {
      await db
        .insert(tenantQuotaUsageModel)
        .values({ tenantId, teamMembersUsed: 1, syncedAt: new Date() })
        .onConflictDoUpdate({
          target: tenantQuotaUsageModel.tenantId,
          set: {
            teamMembersUsed: sql`${tenantQuotaUsageModel.teamMembersUsed} + 1`,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          },
        })
    } else if (metric === "mac") {
      await db
        .insert(tenantQuotaUsageModel)
        .values({ tenantId, macUsed: 1, syncedAt: new Date() })
        .onConflictDoUpdate({
          target: tenantQuotaUsageModel.tenantId,
          set: {
            macUsed: sql`${tenantQuotaUsageModel.macUsed} + 1`,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          },
        })
    } else {
      await db
        .insert(tenantQuotaUsageModel)
        .values({ tenantId, contactsUsed: 1, syncedAt: new Date() })
        .onConflictDoUpdate({
          target: tenantQuotaUsageModel.tenantId,
          set: {
            contactsUsed: sql`${tenantQuotaUsageModel.contactsUsed} + 1`,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          },
        })
    }
  }
}

export const tenantQuotaService = new TenantQuotaService()
