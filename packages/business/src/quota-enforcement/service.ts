import { macTrackingService } from "@chatbotx.io/analytics"
import { db, type Transaction } from "@chatbotx.io/database/client"
import { ROOT_TENANT_ID } from "@chatbotx.io/database/schema"
import { distributedLock } from "@chatbotx.io/redis"
import { tenantService } from "../enterprise/tenant/service"
import { tenantQuotaService } from "../tenant-quota/service"
import { type QuotaMetric, userQuotaService } from "../user-quota/service"

const ALL_METRICS: readonly QuotaMetric[] = [
  "workspaces",
  "channels",
  "teamMembers",
  "contacts",
  "mac",
]

const LOCK_TIMEOUT_SECONDS = 30

export type ConsumeLevel = "user" | "pool"
export type ConsumeResult = { ok: boolean; level?: ConsumeLevel }

/** Per-metric effective usage + limit for display, matching what is enforced. */
export type QuotaUsageSummary = Record<
  QuotaMetric,
  { used: number; limit: number | null }
>

type QuotaContext = {
  tenantId: string
  /** Tenant owner (reseller). `null` for the root tenant (no pool). */
  ownerId: string | null
}

/** `null` (unlimited) acts as +∞ when taking the tighter of two limits. */
const minRemaining = (a: number | null, b: number | null): number | null => {
  if (a === null) {
    return b
  }
  if (b === null) {
    return a
  }
  return Math.min(a, b)
}

/**
 * Two-level quota enforcement: a customer's resource creation is gated by BOTH
 * their own `UserQuota` limit AND the pooled tenant limit (the reseller's plan,
 * read from the tenant owner's `UserQuota`). A reseller acting directly is gated
 * by the pool only; a root-tenant user keeps the legacy per-user behavior.
 *
 * `tryConsume` is the DB-used atomic gate for the synchronous create paths
 * (workspaces, channels, team members). The live-counter helpers
 * (`isAtLimit`/`increment`/`getDualRemainingSlots`) serve the high-frequency
 * contact paths, mirroring the historical single-level schemes per metric.
 */
class QuotaEnforcementService {
  /**
   * Resolve the owner-derived tenant for an actor and that tenant's reseller.
   * Mirrors `workspaceService.resolveTenantForOwner` (inlined to avoid a
   * circular import: workspace → quota-enforcement → workspace).
   */
  private async resolveContext(userId: string): Promise<QuotaContext> {
    const creator = await db.query.userModel.findFirst({
      where: { id: userId },
      columns: { tenantId: true },
    })

    let tenantId = ROOT_TENANT_ID
    if (creator && creator.tenantId !== ROOT_TENANT_ID) {
      tenantId = creator.tenantId
    } else {
      const owned = await tenantService.findByOwner(userId)
      tenantId = owned?.id ?? ROOT_TENANT_ID
    }

    if (tenantId === ROOT_TENANT_ID) {
      return { tenantId, ownerId: null }
    }
    const tenant = await tenantService.findById(tenantId)
    // A suspended (e.g. downgraded) tenant has no live pool: the ex-reseller is
    // governed as a normal root-tenant user by their own `UserQuota`, and its
    // sub-accounts are already blocked at sign-in. Mirrors the suspended-tenant
    // fallback in auth `tenant-context`.
    if (tenant?.status !== "active") {
      return { tenantId: ROOT_TENANT_ID, ownerId: null }
    }
    return { tenantId, ownerId: tenant.ownerId ?? null }
  }

  private isPooled(
    ctx: QuotaContext,
  ): ctx is { tenantId: string; ownerId: string } {
    return ctx.tenantId !== ROOT_TENANT_ID && ctx.ownerId !== null
  }

  /** The lock key that serializes check-then-consume for a resolved context. */
  private lockKeyFor(ctx: QuotaContext, userId: string, metric: QuotaMetric) {
    return this.isPooled(ctx)
      ? `quota:${ctx.tenantId}:${metric}`
      : `quota:user:${userId}:${metric}`
  }

  /**
   * Resolve the distributed-lock key that serializes consumption of `metric`
   * at the granularity that actually gates it — the tenant pool for a pooled
   * actor, else the user. Bulk background paths (e.g. contact import) that hold
   * a lock across check + insert + increment MUST lock on this key, not on the
   * owner id: two sub-accounts under the same reseller pool have different
   * owner ids but share one pool, so an owner-keyed lock lets them both pass
   * the pool check and overrun it. Sharing this key with `tryConsume` also makes
   * the synchronous and bulk paths mutually exclusive.
   */
  async resolveQuotaLockKey(args: {
    userId: string
    metric: QuotaMetric
  }): Promise<string> {
    const ctx = await this.resolveContext(args.userId)
    return this.lockKeyFor(ctx, args.userId, args.metric)
  }

  /**
   * Atomically check + consume one unit of `metric` at both levels. Returns the
   * level that was exhausted when `ok` is `false`.
   */
  async tryConsume(args: {
    userId: string
    metric: QuotaMetric
  }): Promise<ConsumeResult> {
    const { userId, metric } = args
    const ctx = await this.resolveContext(userId)

    if (!this.isPooled(ctx)) {
      // Serialize the check-then-consume so concurrent create requests for the
      // same user cannot both pass the gate and exceed the limit.
      return distributedLock.runExclusive({
        key: this.lockKeyFor(ctx, userId, metric),
        timeoutInSeconds: LOCK_TIMEOUT_SECONDS,
        fn: async (): Promise<ConsumeResult> => {
          const ok = await userQuotaService.tryIncrement(userId, metric)
          return ok ? { ok: true } : { ok: false, level: "user" }
        },
      })
    }

    const { tenantId, ownerId } = ctx
    const isReseller = userId === ownerId

    return distributedLock.runExclusive({
      key: this.lockKeyFor(ctx, userId, metric),
      timeoutInSeconds: LOCK_TIMEOUT_SECONDS,
      fn: async (): Promise<ConsumeResult> => {
        if (
          !(await tenantQuotaService.hasCapacity(tenantId, ownerId, metric))
        ) {
          return { ok: false, level: "pool" }
        }
        if (
          !(isReseller || (await userQuotaService.hasCapacity(userId, metric)))
        ) {
          return { ok: false, level: "user" }
        }

        await tenantQuotaService.consume(tenantId, metric)
        if (!isReseller) {
          await userQuotaService.consume(userId, metric)
        }
        return { ok: true }
      },
    })
  }

  /** Live-counter at-limit check for the background/contact paths. */
  async isAtLimit(args: {
    userId: string
    metric: QuotaMetric
  }): Promise<boolean> {
    const { userId, metric } = args
    const ctx = await this.resolveContext(userId)

    if (!this.isPooled(ctx)) {
      return userQuotaService.isLimitReached(userId, metric)
    }

    const { tenantId, ownerId } = ctx
    if (await tenantQuotaService.isLimitReached(tenantId, ownerId, metric)) {
      return true
    }
    if (userId === ownerId) {
      return false
    }
    return userQuotaService.isLimitReached(userId, metric)
  }

  /** Increment the live counters at every applicable level. */
  async increment(args: {
    userId: string
    metric: QuotaMetric
  }): Promise<void> {
    await this.incrementBy({ ...args, count: 1 })
  }

  async incrementBy(args: {
    userId: string
    metric: QuotaMetric
    count: number
  }): Promise<void> {
    const ctx = await this.resolveContext(args.userId)
    await this.incrementByForCtx(ctx, args.userId, args.metric, args.count)
  }

  /** {@link incrementBy} body for an already-resolved context (no extra DB read). */
  private async incrementByForCtx(
    ctx: QuotaContext,
    userId: string,
    metric: QuotaMetric,
    count: number,
  ): Promise<void> {
    if (count <= 0) {
      return
    }

    if (!this.isPooled(ctx)) {
      await userQuotaService.incrementBy(userId, metric, count)
      return
    }

    const { tenantId, ownerId } = ctx
    await tenantQuotaService.incrementBy(tenantId, metric, count)
    if (userId !== ownerId) {
      await userQuotaService.incrementBy(userId, metric, count)
    }
  }

  /**
   * Atomically gate, create, and consume a MAC slot for a BRAND-NEW contact.
   *
   * MAC (monthly-active-contacts) is the billing hard gate. Unlike the
   * info-only `contacts` metric (incremented out-of-band), a new contact must
   * not be created at all once the MAC limit is reached. This serializes the
   * remaining-slots check + insert + increment under the same distributed lock
   * the contact-import path uses, so concurrent new-contact requests cannot
   * both pass the gate and overrun the limit.
   *
   * The `create` callback performs the actual contact/contactInbox/conversation
   * inserts inside the provided transaction and returns the new ids. On success
   * a `ContactActiveMonthly` presence row is written in the SAME transaction so
   * the later message analytics event for this contact dedups (does not
   * double-count), and the user+pool live MAC counters are incremented after
   * commit.
   *
   * Returns `{ ok: false, level }` (and creates nothing) when the limit is
   * reached; otherwise `{ ok: true, value }` with the callback's value.
   */
  async createNewContactWithMac<T>(args: {
    /** Workspace owner whose plan governs the MAC limit. */
    ownerId: string
    workspaceId: string
    occurredAt?: Date
    create: (tx: Transaction) => Promise<{
      value: T
      contactId: string
      contactInboxId: string
      inboxId: string
    }>
  }): Promise<{ ok: true; value: T } | { ok: false; level: ConsumeLevel }> {
    const { ownerId, workspaceId, create } = args
    const occurredAt = args.occurredAt ?? new Date()
    // Resolve the owner's quota context ONCE for the whole operation and thread
    // it through the lock key, remaining check, exhaustion level, and both
    // counter increments — the new-contact path is hot (every inbound message
    // from a new contact), and re-resolving would issue 3-4 identical owner-row
    // reads, two of them inside the lock.
    const ctx = await this.resolveContext(ownerId)
    const lockKey = this.lockKeyFor(ctx, ownerId, "mac")

    return distributedLock.runExclusive({
      key: lockKey,
      timeoutInSeconds: LOCK_TIMEOUT_SECONDS,
      fn: async (): Promise<
        { ok: true; value: T } | { ok: false; level: ConsumeLevel }
      > => {
        const remaining = await this.dualRemainingSlotsForCtx(
          ctx,
          ownerId,
          "mac",
        )
        if (remaining === 0) {
          return { ok: false, level: await this.macExhaustedLevelForCtx(ctx) }
        }

        // The owner billing-period anchor. Without it there is no MAC period to
        // record presence against (mirrors the async tracker, which skips
        // period-less owners), but a finite `remaining` still means a configured
        // MAC limit exists and must be consumed via the live quota counter.
        const quota = await userQuotaService.getForUser(ownerId)
        const periodStart = quota?.periodStart ?? null

        const { value, counted } = await db.transaction(async (tx) => {
          const created = await create(tx)
          let didCount = false
          if (periodStart) {
            const claim = await macTrackingService.claimNewActiveContact(
              {
                workspaceId,
                contactId: created.contactId,
                contactInboxId: created.contactInboxId,
                inboxId: created.inboxId,
                periodStart,
                occurredAt,
              },
              tx,
            )
            didCount = claim.counted
          }
          return { value: created.value, counted: didCount }
        })

        const shouldConsumeMac = counted || (!periodStart && remaining !== null)
        if (shouldConsumeMac) {
          await this.incrementByForCtx(ctx, ownerId, "mac", 1)
        }
        if (counted) {
          await macTrackingService.incrementWorkspaceMacCache(workspaceId, 1)
        }
        // Info-only total-contacts counter: every brand-new contact counts,
        // independent of the MAC period/limit. Recorded HERE so the single
        // new-contact chokepoint owns all per-new-contact metrics and no caller
        // can forget to bump `contacts` (callers previously did this by hand,
        // and the bulk-import path forgot it entirely).
        await this.incrementByForCtx(ctx, ownerId, "contacts", 1)

        return { ok: true, value }
      },
    })
  }

  /** {@link macExhaustedLevel} for an already-resolved context. */
  private async macExhaustedLevelForCtx(
    ctx: QuotaContext,
  ): Promise<ConsumeLevel> {
    if (
      this.isPooled(ctx) &&
      (await tenantQuotaService.isLimitReached(
        ctx.tenantId,
        ctx.ownerId,
        "mac",
      ))
    ) {
      return "pool"
    }
    return "user"
  }

  /**
   * Read-only, DB-used at-limit check for a single metric, combining the levels
   * that apply to the actor. Used by non-consuming gates (e.g. issuing an
   * invitation) and the UI. Does not touch any counter.
   */
  async hasReachedLimit(args: {
    userId: string
    metric: QuotaMetric
  }): Promise<boolean> {
    const ctx = await this.resolveContext(args.userId)
    return this.atLimitForMetric(ctx, args.userId, args.metric)
  }

  private async atLimitForMetric(
    ctx: QuotaContext,
    userId: string,
    metric: QuotaMetric,
  ): Promise<boolean> {
    const pooled = this.isPooled(ctx)

    if (pooled && userId === ctx.ownerId) {
      // Reseller acting directly: only the pool governs.
      return tenantQuotaService.isLimitReached(
        ctx.tenantId,
        ctx.ownerId,
        metric,
      )
    }

    const userFull = await userQuotaService.isLimitReached(userId, metric)
    if (!pooled) {
      return userFull
    }
    if (userFull) {
      return true
    }
    return tenantQuotaService.isLimitReached(
      ctx.tenantId,
      ctx.ownerId as string,
      metric,
    )
  }

  /** Tighter of the user and pool remaining slots (`null` = unlimited). */
  async getDualRemainingSlots(args: {
    userId: string
    metric: QuotaMetric
  }): Promise<number | null> {
    const ctx = await this.resolveContext(args.userId)
    return this.dualRemainingSlotsForCtx(ctx, args.userId, args.metric)
  }

  /** {@link getDualRemainingSlots} body for an already-resolved context. */
  private async dualRemainingSlotsForCtx(
    ctx: QuotaContext,
    userId: string,
    metric: QuotaMetric,
  ): Promise<number | null> {
    if (!this.isPooled(ctx)) {
      return userQuotaService.getRemainingSlots(userId, metric)
    }

    const { tenantId, ownerId } = ctx
    const isReseller = userId === ownerId
    const [poolRemaining, userRemaining] = await Promise.all([
      tenantQuotaService.getRemainingSlots(tenantId, ownerId, metric),
      isReseller
        ? Promise.resolve<number | null>(null)
        : userQuotaService.getRemainingSlots(userId, metric),
    ])
    return minRemaining(userRemaining, poolRemaining)
  }

  /**
   * Per-metric effective `{ used, limit }` for the usage display, picking the
   * same level the gating uses so the numbers match what is enforced:
   * - reseller acting directly → the pooled aggregate vs. their plan limit;
   * - sub-account / root-tenant user → their own `UserQuota` (a sub-account's
   *   pool ceiling is enforced server-side but other tenants' usage is not
   *   disclosed here).
   */
  async getUsageSummary(userId: string): Promise<QuotaUsageSummary> {
    const ctx = await this.resolveContext(userId)

    if (this.isPooled(ctx) && userId === ctx.ownerId) {
      // `used` from the live pool counters (near-real-time), `limit` from the
      // reseller's plan row — so the display tracks live activity instead of
      // the scheduled DB sync.
      const [liveUsed, ownerQuota] = await Promise.all([
        tenantQuotaService.getLiveUsage(ctx.tenantId),
        userQuotaService.getForUser(ctx.ownerId),
      ])
      return Object.fromEntries(
        ALL_METRICS.map((metric) => [
          metric,
          {
            used: liveUsed[metric],
            limit: userQuotaService.metricValues(ownerQuota, metric).limit,
          },
        ]),
      ) as QuotaUsageSummary
    }

    // `used` from the live per-user counters (near-real-time), `limit` from the
    // cached quota row — the value the user sees now matches what enforcement
    // counts, with no wait for the next `sync-user-quota` pass.
    const [liveUsed, quota] = await Promise.all([
      userQuotaService.getLiveUsage(userId),
      userQuotaService.getForUser(userId),
    ])
    return Object.fromEntries(
      ALL_METRICS.map((metric) => [
        metric,
        {
          used: liveUsed[metric],
          limit: userQuotaService.metricValues(quota, metric).limit,
        },
      ]),
    ) as QuotaUsageSummary
  }

  /**
   * Per-metric at-limit booleans for the UI (live-counter based, matching both
   * the enforcement gates and the sidebar usage display). Combines both levels
   * for a customer; pool-only for a reseller; user-only for a root-tenant user.
   */
  async getAtLimitMap(userId: string): Promise<Record<QuotaMetric, boolean>> {
    const ctx = await this.resolveContext(userId)

    const entries = await Promise.all(
      ALL_METRICS.map(
        async (metric): Promise<[QuotaMetric, boolean]> => [
          metric,
          await this.atLimitForMetric(ctx, userId, metric),
        ],
      ),
    )

    return Object.fromEntries(entries) as Record<QuotaMetric, boolean>
  }
}

export const quotaEnforcementService = new QuotaEnforcementService()
