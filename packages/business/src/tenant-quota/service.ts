import {
  and,
  count,
  db,
  eq,
  gt,
  lte,
  ne,
  sql,
  sum,
} from "@chatbotx.io/database/client"
import {
  contactModel,
  inboxModel,
  tenantQuotaUsageModel,
  workspaceMacModel,
  workspaceMemberModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import type { TenantQuotaUsageModel } from "@chatbotx.io/database/types"
import { cacheConnections } from "@chatbotx.io/redis"
import { BaseService } from "../base.service"
import { logger } from "../logger"
import {
  LiveCounterStore,
  type QuotaMetric,
  TENANT_QUOTA_LABEL,
} from "../quota-shared/live-counter-store"
import { userQuotaService } from "../user-quota/service"

const LIVE_KEY_PREFIX = `${TENANT_QUOTA_LABEL}-live:`

/**
 * Pooled usage counters for a white-label tenant (reseller). Usage is the sum
 * of every customer's resources under the tenant; the *limit* is read from the
 * tenant owner's `UserQuota` row (written by the enterprise billing layer). The
 * Redis live-counter + high-water-mark reconciliation design mirrors
 * `UserQuotaService` so the two levels behave identically.
 */
class TenantQuotaService extends BaseService {
  /** Shared Redis-counter + row-cache + upsert mechanics (pooled-tenant scope). */
  private readonly store = new LiveCounterStore<TenantQuotaUsageModel>({
    label: TENANT_QUOTA_LABEL,
    table: tenantQuotaUsageModel,
    idColumn: tenantQuotaUsageModel.tenantId,
    idKey: "tenantId",
    usedColumns: {
      workspaces: tenantQuotaUsageModel.workspacesUsed,
      channels: tenantQuotaUsageModel.channelsUsed,
      teamMembers: tenantQuotaUsageModel.teamMembersUsed,
      contacts: tenantQuotaUsageModel.contactsUsed,
      mac: tenantQuotaUsageModel.macUsed,
    },
    getUsed: (usage, metric) => this.getUsedValue(usage, metric),
    fetchRow: (tenantId) =>
      db.query.tenantQuotaUsageModel
        .findFirst({ where: { tenantId } })
        .then((row) => row ?? null),
  })

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

  async getUsage(tenantId: string): Promise<TenantQuotaUsageModel | null> {
    const cached = await this.store.getCachedRow(tenantId)
    if (cached) {
      return cached
    }

    const usage = await db.query.tenantQuotaUsageModel.findFirst({
      where: { tenantId },
    })
    if (usage) {
      await this.store.putCachedRow(tenantId, usage)
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
    await this.store.upsertMetric(tenantId, metric)
    await this.store.invalidate(tenantId)
  }

  /** Live-counter limit check (used by the high-frequency contact paths). */
  async isLimitReached(
    tenantId: string,
    ownerId: string,
    metric: QuotaMetric,
  ): Promise<boolean> {
    const [limit, liveCount] = await Promise.all([
      userQuotaService.getLimit(ownerId, metric),
      this.store.getLiveCount(tenantId, metric),
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
      this.store.getLiveCount(tenantId, metric),
    ])
    if (limit === null) {
      return null
    }
    return Math.max(0, limit - liveCount)
  }

  /**
   * Near-real-time pooled `used` per metric from the Redis live counters
   * (cold-seeded from the DB). Drives the reseller usage display. Note `mac` is
   * not fed live at the pool level (mac-tracking writes the per-user and
   * workspace caches, never the pool), so pooled `mac` stays only as fresh as
   * the reconcile job — every other metric tracks live pool activity.
   */
  getLiveUsage(tenantId: string): Promise<Record<QuotaMetric, number>> {
    return this.store.getLiveCounts(tenantId)
  }

  async increment(tenantId: string, metric: QuotaMetric): Promise<void> {
    await this.incrementBy(tenantId, metric, 1)
  }

  async incrementBy(
    tenantId: string,
    metric: QuotaMetric,
    count: number,
  ): Promise<void> {
    await this.store.incrementBy(tenantId, metric, count)
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
   * across every workspace under the tenant. The recomputed `COUNT(*)` is the
   * authoritative current value (already reflects deletions) and is assigned
   * directly so freeing pooled resources frees pooled quota. Errors are logged
   * and swallowed so one tenant can't fail the batch.
   *
   * `mac` (monthly-active-contacts) is summed from the `WorkspaceMac` rollup for
   * the *current* period only — nothing feeds the tenant live `mac` counter
   * (mac-tracking writes the workspace and per-user caches, never the pool), so
   * the rollup is the pool's only source of truth. Summing the active-now rows
   * makes it reset naturally at period rollover, mirroring the contacts recount.
   */
  async reconcileFromDb(tenantId: string): Promise<void> {
    try {
      const client = await cacheConnections.useExisting()

      const [
        [contactsResult],
        [teamMembersResult],
        [workspacesResult],
        [channelsResult],
        [macResult],
      ] = await Promise.all([
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

        db
          .select({ count: count() })
          .from(workspaceModel)
          .where(eq(workspaceModel.tenantId, tenantId)),

        db
          .select({ count: count() })
          .from(inboxModel)
          .innerJoin(
            workspaceModel,
            eq(inboxModel.workspaceId, workspaceModel.id),
          )
          .where(eq(workspaceModel.tenantId, tenantId)),

        db
          .select({ total: sum(workspaceMacModel.macCount) })
          .from(workspaceMacModel)
          .innerJoin(
            workspaceModel,
            eq(workspaceMacModel.workspaceId, workspaceModel.id),
          )
          .where(
            and(
              eq(workspaceModel.tenantId, tenantId),
              lte(workspaceMacModel.periodStart, sql`now()`),
              gt(workspaceMacModel.periodEnd, sql`now()`),
            ),
          ),
      ])

      const contactsUsed = contactsResult?.count ?? 0
      const teamMembersUsed = teamMembersResult?.count ?? 0
      const workspacesUsed = workspacesResult?.count ?? 0
      const channelsUsed = channelsResult?.count ?? 0
      // `sum()` returns a numeric string (or null when no rows match).
      const macUsed = Number(macResult?.total ?? 0)

      await db
        .insert(tenantQuotaUsageModel)
        .values({
          tenantId,
          contactsUsed,
          teamMembersUsed,
          workspacesUsed,
          channelsUsed,
          macUsed,
          syncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: tenantQuotaUsageModel.tenantId,
          set: {
            // Authoritative current count — assigned directly, NOT GREATEST — so
            // deletions across the pool free quota. A transiently-low COUNT
            // self-corrects on the next sync.
            contactsUsed,
            teamMembersUsed,
            workspacesUsed,
            channelsUsed,
            macUsed,
            syncedAt: new Date(),
            updatedAt: sql`CURRENT_TIMESTAMP`,
          },
        })

      // Mirror the live counters to the same authoritative current counts.
      await client.hset(
        this.store.liveKey(tenantId),
        "contacts",
        String(contactsUsed),
        "teamMembers",
        String(teamMembersUsed),
        "workspaces",
        String(workspacesUsed),
        "channels",
        String(channelsUsed),
        "mac",
        String(macUsed),
      )

      await this.store.invalidate(tenantId)
    } catch (err) {
      logger.error(
        { err, tenantId },
        "tenant-quota: failed to reconcile tenant quota",
      )
    }
  }
}

export const tenantQuotaService = new TenantQuotaService()
