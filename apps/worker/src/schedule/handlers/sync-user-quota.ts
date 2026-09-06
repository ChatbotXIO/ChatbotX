import { macRepository } from "@chatbotx.io/analytics"
import {
  parseLiveCount,
  tenantService,
  userQuotaService,
  WORKSPACE_USAGE_LABEL,
  workspaceUsageService,
} from "@chatbotx.io/business"
import { cacheConnections } from "@chatbotx.io/redis"
import { liveKeyFor, USER_QUOTA_LABEL } from "@chatbotx.io/utils"
import { logger } from "../../lib/logger"

// Derived from the shared key builder so the reconcile walks exactly the keys
// the UserQuotaService writes (`liveKeyFor(label, "")` → `${label}-live:`).
const LIVE_KEY_PREFIX = liveKeyFor(USER_QUOTA_LABEL, "")
/** Live-counter hash field holding the running monthly-active-contacts count. */
const MAC_FIELD = "mac"
/**
 * Live-counter hash field stamping which billing period the `mac` count belongs
 * to (the `UserQuota.periodStart` ISO, or "" when the user has no period). We
 * key the monthly reset off this stamp rather than a DB column so no migration
 * is needed and the marker is reseeded from the DB on cache eviction.
 */
const MAC_PERIOD_FIELD = "macPeriodStart"

type CacheClient = Awaited<ReturnType<typeof cacheConnections.useExisting>>

export const syncUserQuota = async (): Promise<void> => {
  const client = await cacheConnections.useExisting()

  await reconcileWorkspaceUsage(client)

  // SCAN instead of KEYS to avoid blocking Redis on large key sets
  const userIds: string[] = []
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
      userIds.push(key.slice(LIVE_KEY_PREFIX.length))
    }
  } while (cursor !== "0")

  // Union in active reseller owner IDs from DB so cold owners (no Redis live
  // key yet, or key expired) are always walked — their pool counters must be
  // reconciled even before any sub-account activity warms the live-counter key.
  const activeOwnerIds = await tenantService.listActiveOwnerIds()
  const userIdSet = new Set(userIds)
  for (const ownerId of activeOwnerIds) {
    userIdSet.add(ownerId)
  }
  const allUserIds = [...userIdSet]

  if (allUserIds.length === 0) {
    return
  }

  logger.info(
    { count: allUserIds.length },
    "user-quota: syncing quota for users",
  )

  // Process in batches to avoid overwhelming the DB
  const BATCH_SIZE = 50
  for (let i = 0; i < allUserIds.length; i += BATCH_SIZE) {
    const batch = allUserIds.slice(i, i + BATCH_SIZE)
    await Promise.all(batch.map(reconcileUser))
  }
}

/**
 * Re-ground the display-only WorkspaceUsage breakdown from its source tables.
 * Bot messages intentionally remain untouched because their account-level
 * counterpart is also write-through-only.
 */
export const reconcileWorkspaceUsage = async (
  client: CacheClient,
): Promise<void> => {
  try {
    const [
      {
        workspaceIds,
        contactsByWorkspace,
        channelsByWorkspace,
        membersByWorkspace,
      },
      macCounts,
    ] = await Promise.all([
      workspaceUsageService.loadReconcileCounts(),
      macRepository.getActiveContactCountsByWorkspaceIds(),
    ])

    const BATCH_SIZE = 50
    for (let i = 0; i < workspaceIds.length; i += BATCH_SIZE) {
      const batch = workspaceIds.slice(i, i + BATCH_SIZE)
      await Promise.all(
        batch.map(async (workspaceId) => {
          const contactsUsed = contactsByWorkspace.get(workspaceId) ?? 0
          const channelsUsed = channelsByWorkspace.get(workspaceId) ?? 0
          const teamMembersUsed = membersByWorkspace.get(workspaceId) ?? 0
          const macUsed = macCounts.get(workspaceId) ?? 0

          await workspaceUsageService.upsertReconciled({
            workspaceId,
            contactsUsed,
            channelsUsed,
            teamMembersUsed,
            macUsed,
          })

          await client.hset(
            liveKeyFor(WORKSPACE_USAGE_LABEL, workspaceId),
            "contacts",
            String(contactsUsed),
            "channels",
            String(channelsUsed),
            "teamMembers",
            String(teamMembersUsed),
            "mac",
            String(macUsed),
          )
          await workspaceUsageService.invalidate(workspaceId)
        }),
      )
    }
  } catch (err) {
    logger.error({ err }, "workspace-usage: failed to reconcile usage")
  }
}

export const reconcileUser = async (userId: string): Promise<void> => {
  try {
    // A reseller owner's `UserQuota` row IS the tenant pool: reconcile it from
    // the whole-tenant aggregate (own resources carry the reseller tenantId too,
    // so they're already included) instead of the per-owner self-count below. A
    // suspended tenant falls through to the per-user path (ex-reseller governed
    // as a normal root-tenant user), mirroring the enforcement fallback.
    const ownedTenant = await tenantService.findByOwner(userId)
    if (ownedTenant?.status === "active") {
      await userQuotaService.reconcileOwnerPoolUsage(userId, ownedTenant.id)
      return
    }

    const client = await cacheConnections.useExisting()

    // Authoritative current counts assigned directly (not GREATEST) so
    // removing contacts/team members/workspaces/channels frees quota, and
    // the four billing markers read back in one round-trip.
    const stored = await userQuotaService.reconcileUserSelfUsage(userId)
    const isLifetime = stored.periodEnd == null

    await reconcileMac(
      userId,
      client,
      stored.macUsed,
      stored.periodStart?.toISOString() ?? "",
      isLifetime,
    )

    await reconcileMonthlyBotMessages(
      userId,
      client,
      stored.monthlyBotMessagesPeriodStart,
      stored.periodStart,
      isLifetime,
    )

    await userQuotaService.invalidate(userId)
  } catch (err) {
    logger.error({ err, userId }, "user-quota: failed to reconcile user quota")
  }
}

/**
 * Reconcile the monthly-active-contacts counter between the live Redis hash and
 * the durable `UserQuota.macUsed` column, handling the billing-cycle reset.
 *
 * Ownership split: the private enterprise quota-worker owns the plan logic — on
 * a recurring renewal it advances `UserQuota.periodStart` and zeroes `macUsed`;
 * for a lifetime plan (`periodEnd` null) `periodStart` never advances, so MAC
 * never resets. This OSS-side helper only makes the volatile live counter follow
 * that DB authority, keyed entirely off the `periodStart` stamp:
 *   - new period (stamp differs)  → trust the DB (reset value), re-stamp;
 *   - same period                 → snapshot the live count into the DB so the
 *                                    usage display stays current and survives
 *                                    cache eviction.
 *
 * Live increments (`mac-tracking`) use a raw HINCRBY that never stamps the
 * period, so an unstamped counter is adopted into the current period rather than
 * wiped — avoiding data loss on the first sync after the field appears. The only
 * gap: a counter created AND a cycle rollover both landing inside a single sync
 * interval before any stamp exists would briefly carry over; it self-corrects at
 * the next boundary.
 */
const reconcileMac = async (
  userId: string,
  client: CacheClient,
  dbMacUsed: number,
  dbPeriodIso: string,
  isLifetime: boolean,
): Promise<void> => {
  const liveKey = liveKeyFor(USER_QUOTA_LABEL, userId)
  const [liveMacRaw, livePeriod] = await client.hmget(
    liveKey,
    MAC_FIELD,
    MAC_PERIOD_FIELD,
  )

  const rolledOver = livePeriod !== null && livePeriod !== dbPeriodIso

  // Resetting plan settled in its current period → the `ContactActiveMonthly`
  // ledger is the durable source of truth (every MAC increment writes a
  // presence row in the same transaction as the live-counter bump). Re-ground
  // both the live counter and `macUsed` on the ledger count so a lost Redis
  // increment self-heals. Excluded — handled by the stamp logic below:
  //  - period-less owners (no anchor, not MAC-tracked);
  //  - lifetime plans (accumulate across months, never reset);
  //  - a just-detected cycle rollover (defer to the private quota-worker's
  //    reset, then ledger-reconcile on the next run once stamped).
  if (dbPeriodIso && !isLifetime && !rolledOver) {
    const ledgerMac = await macRepository.countActiveContactsForOwner({
      ownerId: userId,
      billingPeriodStart: new Date(dbPeriodIso),
      cumulative: false,
    })

    if (liveMacRaw !== String(ledgerMac) || livePeriod !== dbPeriodIso) {
      await client.hset(
        liveKey,
        MAC_FIELD,
        String(ledgerMac),
        MAC_PERIOD_FIELD,
        dbPeriodIso,
      )
    }
    if (ledgerMac !== dbMacUsed) {
      await persistMacUsed(userId, ledgerMac)
    }
    return
  }

  const action = resolveMacReconcileAction(
    liveMacRaw,
    livePeriod,
    dbMacUsed,
    dbPeriodIso,
  )

  if (action.setLiveMac !== null && action.stampPeriod) {
    await client.hset(
      liveKey,
      MAC_FIELD,
      String(action.setLiveMac),
      MAC_PERIOD_FIELD,
      dbPeriodIso,
    )
  } else if (action.stampPeriod) {
    await client.hset(liveKey, MAC_PERIOD_FIELD, dbPeriodIso)
  }

  if (action.persistMacUsed !== null) {
    await persistMacUsed(userId, action.persistMacUsed)
  }
}

/** Upsert `UserQuota.macUsed` to an absolute value. */
const persistMacUsed = async (userId: string, value: number): Promise<void> => {
  await userQuotaService.persistMacUsed(userId, value)
}

/** Live-counter hash field holding the running monthly-bot-messages count. */
const MONTHLY_BOT_MESSAGES_FIELD = "monthlyBotMessages"

/**
 * Reconcile the monthly-bot-messages counter's billing-cycle reset. Unlike MAC
 * (which is keyed off a Redis-only stamp, safe because a durable ledger
 * backstops it), this metric has no reconcile ledger at all — losing the stamp
 * would silently mis-fire or skip a reset on a value that (once top-up credits
 * exist) also gates paid purchases. So the stamp is a real DB column,
 * `UserQuota.monthlyBotMessagesPeriodStart`, not a Redis field.
 *
 * - Lifetime plan (`periodEnd` null) → never reset; `botMessages`/credits ride
 *   the separate lifetime cap, and this metric simply isn't in play.
 * - No billing anchor (`periodStart` null) → no-op.
 * - Unstamped row (`monthlyBotMessagesPeriodStart` null; first run or a row
 *   that predates this column) → stamp to the current `periodStart`, but do
 *   NOT zero the counter — existing rows have accumulated an un-reset count
 *   since forever, and zeroing on first sight would hand every existing
 *   customer a free month. Adopt-into-current-period, mirroring the MAC
 *   unstamped-counter rule (`resolveMacReconcileAction`).
 * - Stamp older than `periodStart` → the billing cycle rolled over: zero the
 *   counter and re-stamp.
 * - Stamp equal to `periodStart` → no-op, already reconciled this period.
 */
export interface MonthlyBotMessagesResetAction {
  /** Zero `UserQuota.monthlyBotMessagesUsed` and the live counter field. */
  reset: boolean
  /** (Re)stamp `monthlyBotMessagesPeriodStart` to `periodStart`. */
  stamp: boolean
}

const NO_OP_MONTHLY_RESET: MonthlyBotMessagesResetAction = {
  reset: false,
  stamp: false,
}

export function resolveMonthlyBotMessagesReset(
  storedPeriodStamp: Date | null,
  periodStart: Date | null,
  isLifetime: boolean,
): MonthlyBotMessagesResetAction {
  if (isLifetime || periodStart === null) {
    return NO_OP_MONTHLY_RESET
  }

  if (storedPeriodStamp === null) {
    return { reset: false, stamp: true }
  }

  if (storedPeriodStamp.getTime() < periodStart.getTime()) {
    return { reset: true, stamp: true }
  }

  return NO_OP_MONTHLY_RESET
}

/**
 * Apply {@link resolveMonthlyBotMessagesReset}'s decision. Ordering matters: the
 * DB counter is zeroed BEFORE the live Redis field, so a crash between the two
 * writes leaves the live count high — enforcement fails CLOSED (briefly
 * over-blocks) rather than open (under-blocks past a paid-for cap).
 */
const reconcileMonthlyBotMessages = async (
  userId: string,
  client: CacheClient,
  storedPeriodStamp: Date | null,
  periodStart: Date | null,
  isLifetime: boolean,
): Promise<void> => {
  const action = resolveMonthlyBotMessagesReset(
    storedPeriodStamp,
    periodStart,
    isLifetime,
  )

  if (!action.stamp) {
    return
  }

  // Ordering is load-bearing: the DB counter is zeroed BEFORE the live Redis
  // field, so `applyMonthlyBotMessagesReset` (which writes the DB row) is
  // awaited first, and the live `hset` for the reset branch stays here,
  // after it — fail-closed if a crash lands between the two.
  await userQuotaService.applyMonthlyBotMessagesReset({
    userId,
    periodStart,
    reset: action.reset,
  })

  if (action.reset) {
    await client.hset(
      liveKeyFor(USER_QUOTA_LABEL, userId),
      MONTHLY_BOT_MESSAGES_FIELD,
      "0",
    )
  }
}

/** What `reconcileMac` should write, derived purely from the current state. */
export interface MacReconcileAction {
  /** Persist this value to `UserQuota.macUsed` (null = no DB write). */
  persistMacUsed: number | null
  /** Overwrite the live `mac` field with this value (null = leave it). */
  setLiveMac: number | null
  /** (Re)stamp the live period field to the DB period. */
  stampPeriod: boolean
}

const NO_OP: MacReconcileAction = {
  setLiveMac: null,
  stampPeriod: false,
  persistMacUsed: null,
}

/**
 * Pure decision for the monthly-active-contacts reconciliation. Keyed entirely
 * off the live period stamp vs. the DB `periodStart`:
 *   - nothing tracked or stored      → no-op (don't create empty fields);
 *   - stamp present and differs      → cycle rolled over: trust the DB value and
 *                                       re-stamp (lifetime never rolls, so this
 *                                       never fires for it);
 *   - no stamp (first sight) / equal  → live counter is authoritative: stamp if
 *                                       needed and snapshot it into the DB.
 */
export function resolveMacReconcileAction(
  liveMacRaw: string | null,
  livePeriod: string | null,
  dbMacUsed: number,
  dbPeriodIso: string,
): MacReconcileAction {
  if (liveMacRaw === null && dbMacUsed === 0) {
    return NO_OP
  }

  if (livePeriod !== null && livePeriod !== dbPeriodIso) {
    return { setLiveMac: dbMacUsed, stampPeriod: true, persistMacUsed: null }
  }

  // Fail closed on a corrupt (non-numeric) live field: fall back to the DB value
  // rather than coercing to NaN, which would otherwise be persisted into the
  // integer `macUsed` column and corrupt the durable count.
  const liveMac = parseLiveCount(liveMacRaw) ?? dbMacUsed
  return {
    setLiveMac: null,
    stampPeriod: livePeriod === null,
    persistMacUsed: liveMac === dbMacUsed ? null : liveMac,
  }
}
