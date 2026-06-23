import { db, eq, sql } from "@chatbotx.io/database/client"
import { planStatuses } from "@chatbotx.io/database/partials"
import { userQuotaModel } from "@chatbotx.io/database/schema"
import type { UserQuotaModel } from "@chatbotx.io/database/types"
import { distributedStore } from "@chatbotx.io/redis"
import { BaseService } from "../base.service"
import { logger } from "../logger"
import {
  LiveCounterStore,
  type QuotaMetric,
  USER_QUOTA_LABEL,
} from "../quota-shared/live-counter-store"

export type { QuotaMetric } from "../quota-shared/live-counter-store"

/**
 * Cross-repo contract key (read-only here). The enterprise billing layer writes
 * the platform default plan's entitlements to this key; we read it as the
 * free-tier fallback for users with no per-user UserQuota row. Absent in pure
 * OSS installs → no fallback (unlimited), preserving prior behavior.
 */
const DEFAULT_PLAN_ENTITLEMENT_KEY = "entitlements:default-plan"

interface DefaultPlanSnapshot {
  channelsLimit: number | null
  contactsLimit: number | null
  macLimit: number | null
  planName: string
  saasMode: boolean
  ssoSaml: boolean
  teamMembersLimit: number | null
  trialDays: number
  whiteLabel: boolean
  workspacesLimit: number | null
}

/**
 * Result of evaluating whether a user may access the app. `blocked` is the only
 * field the gate needs; the rest drive the "trial ended / X days left" UI.
 *  - status mirrors UserQuota.planStatus (active|past_due|trial|expired).
 *  - a user with no quota row at all (pure OSS install) is never blocked.
 */
export interface AccessState {
  blocked: boolean
  planName: string | null
  status: string | null
  trialEndsAt: Date | null
}

class UserQuotaService extends BaseService {
  /** Shared Redis-counter + row-cache + upsert mechanics (per-user scope). */
  private readonly store = new LiveCounterStore<UserQuotaModel>({
    label: USER_QUOTA_LABEL,
    table: userQuotaModel,
    idColumn: userQuotaModel.userId,
    idKey: "userId",
    usedColumns: {
      workspaces: userQuotaModel.workspacesUsed,
      channels: userQuotaModel.channelsUsed,
      teamMembers: userQuotaModel.teamMembersUsed,
      contacts: userQuotaModel.contactsUsed,
      mac: userQuotaModel.macUsed,
    },
    getUsed: (quota, metric) => this.getUsedValue(quota, metric),
    fetchRow: (userId) =>
      db.query.userQuotaModel
        .findFirst({ where: { userId } })
        .then((row) => row ?? null),
  })

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

  /** Invalidate the cached quota row (used by the reconcile worker after a sync). */
  async invalidate(userId: string): Promise<void> {
    await this.store.invalidate(userId)
  }

  async getForUser(userId: string): Promise<UserQuotaModel | null> {
    const cached = await this.store.getCachedRow(userId)
    if (cached) {
      return cached
    }

    const quota = await db.query.userQuotaModel.findFirst({ where: { userId } })

    // Free tier = no row, or a usage-only row the billing layer never synced
    // (planStatus null). Overlay the platform default-plan limits published by
    // the enterprise layer so free limits are enforced. Without a published
    // default (pure OSS install) this is a no-op → prior unlimited behavior.
    if (!quota || quota.planStatus === null) {
      const effective = await this.applyDefaultPlan(userId, quota ?? null)
      if (effective) {
        await this.store.putCachedRow(userId, effective)
        return effective
      }
    }

    if (quota) {
      await this.store.putCachedRow(userId, quota)
      return quota
    }
    return null
  }

  /**
   * Overlay the shared default-plan entitlement snapshot onto a free-tier user.
   * Fills only unset (null) limit fields and the plan identity, preserving any
   * existing usage counters. Returns null when no default plan is published.
   */
  private async applyDefaultPlan(
    userId: string,
    quota: UserQuotaModel | null,
  ): Promise<UserQuotaModel | null> {
    let snapshot: DefaultPlanSnapshot | null = null
    try {
      snapshot = await distributedStore.get<DefaultPlanSnapshot>(
        DEFAULT_PLAN_ENTITLEMENT_KEY,
      )
    } catch (err) {
      logger.warn({ err }, "user-quota: default-plan snapshot read failed")
      return null
    }
    if (!snapshot) {
      return null
    }

    const now = new Date()
    const base: UserQuotaModel = quota ?? {
      id: "",
      createdAt: now,
      updatedAt: now,
      userId,
      contactsLimit: null,
      contactsUsed: 0,
      workspacesLimit: null,
      workspacesUsed: 0,
      channelsLimit: null,
      channelsUsed: 0,
      teamMembersLimit: null,
      teamMembersUsed: 0,
      macLimit: null,
      macUsed: 0,
      whiteLabel: false,
      ssoSaml: false,
      saasMode: false,
      planName: null,
      planStatus: null,
      periodStart: null,
      periodEnd: null,
      syncedAt: now,
    }

    return {
      ...base,
      contactsLimit: base.contactsLimit ?? snapshot.contactsLimit,
      workspacesLimit: base.workspacesLimit ?? snapshot.workspacesLimit,
      channelsLimit: base.channelsLimit ?? snapshot.channelsLimit,
      teamMembersLimit: base.teamMembersLimit ?? snapshot.teamMembersLimit,
      // Monthly-active-contacts cap (`Plan.limits.monthlyActiveContacts`) maps to
      // `macLimit`, NOT `contactsLimit`; without this the free-tier overlay would
      // leave macLimit null (unlimited MAC) even when the default plan caps it.
      macLimit: base.macLimit ?? snapshot.macLimit,
      whiteLabel: base.whiteLabel || snapshot.whiteLabel,
      ssoSaml: base.ssoSaml || snapshot.ssoSaml,
      saasMode: base.saasMode || snapshot.saasMode,
      planName: base.planName ?? snapshot.planName,
      // Fail-open: a user with no per-user row yet (gap between sign-up and the
      // quota-worker) is never blocked. The worker later writes the real status
      // ("trial" + periodEnd, etc.), which getAccessState then enforces.
      planStatus: base.planStatus ?? planStatuses.enum.active,
    }
  }

  /**
   * Whether the user may access the app, based on the entitlement snapshot.
   * Blocked only when a self-managed trial has expired or was consumed:
   *   - planStatus === "expired"  (trial consumed / churned)
   *   - planStatus === "trial" and periodEnd has passed
   * Everything else (active, past_due, no row) is allowed.
   */
  async getAccessState(userId: string): Promise<AccessState> {
    const quota = await this.getForUser(userId)
    return this.getAccessStateFromQuota(quota)
  }

  /**
   * Pure derivation of {@link AccessState} from an already-fetched quota row.
   * Use this when the caller has already loaded the quota (e.g. an RSC that also
   * renders usage bars) to avoid a redundant `getForUser` round-trip.
   */
  getAccessStateFromQuota(quota: UserQuotaModel | null): AccessState {
    if (!quota) {
      return { blocked: false, status: null, planName: null, trialEndsAt: null }
    }

    const trialExpired =
      quota.planStatus === planStatuses.enum.trial &&
      quota.periodEnd !== null &&
      new Date(quota.periodEnd).getTime() <= Date.now()
    const blocked =
      quota.planStatus === planStatuses.enum.expired || trialExpired

    return {
      blocked,
      status: quota.planStatus,
      planName: quota.planName,
      trialEndsAt:
        quota.planStatus === planStatuses.enum.trial ? quota.periodEnd : null,
    }
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
    await this.store.invalidate(userId)
  }

  /**
   * Whether the user's *stored* quota row carries a purchased white-label
   * entitlement. Reads the raw column directly — NOT `getForUser()` — because
   * that method overlays the platform default-plan snapshot, which can OR-in
   * `whiteLabel`; a default-plan flag must never be mistaken for a purchased
   * reseller plan when deciding whether to provision a tenant. No row → false.
   */
  async hasWhiteLabelEntitlement(userId: string): Promise<boolean> {
    const quota = await db.query.userQuotaModel.findFirst({
      where: { userId },
      columns: { whiteLabel: true },
    })
    return quota?.whiteLabel === true
  }

  /**
   * Ids of every user whose stored quota row has `whiteLabel = true`. Used by
   * the tenant-provisioning reconcile to find resellers that should own a
   * tenant. Reads the raw column (see {@link hasWhiteLabelEntitlement}).
   */
  async listWhiteLabelOwnerIds(): Promise<string[]> {
    const rows = await db.query.userQuotaModel.findMany({
      where: { whiteLabel: true },
      columns: { userId: true },
    })
    return rows.map((row) => row.userId)
  }

  async isLimitReached(userId: string, metric: QuotaMetric): Promise<boolean> {
    const [quota, liveCount] = await Promise.all([
      this.getForUser(userId),
      this.store.getLiveCount(userId, metric),
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
      this.store.getLiveCount(userId, metric),
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

  /**
   * Near-real-time `used` per metric, read from the Redis live counters
   * (cold-seeded from the DB, so always at least as fresh as the synced
   * columns). Drives the usage display so the shown number tracks live activity
   * instead of lagging the scheduled `sync-user-quota` job by up to a full sync
   * interval. Limits still come from the (rarely-changing) cached quota row.
   */
  getLiveUsage(userId: string): Promise<Record<QuotaMetric, number>> {
    return this.store.getLiveCounts(userId)
  }

  async increment(userId: string, metric: QuotaMetric): Promise<void> {
    await this.incrementBy(userId, metric, 1)
  }

  async incrementBy(
    userId: string,
    metric: QuotaMetric,
    count: number,
  ): Promise<void> {
    await this.store.incrementBy(userId, metric, count)
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
    await this.store.upsertMetric(userId, metric)
    await this.store.invalidate(userId)
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
}

export const userQuotaService = new UserQuotaService()
