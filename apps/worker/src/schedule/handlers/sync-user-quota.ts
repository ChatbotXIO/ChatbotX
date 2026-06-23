import { macRepository } from "@chatbotx.io/analytics"
import {
  liveKeyFor,
  parseLiveCount,
  USER_QUOTA_LABEL,
  userQuotaService,
} from "@chatbotx.io/business"
import { and, count, db, eq, ne, sql } from "@chatbotx.io/database/client"
import {
  contactModel,
  inboxModel,
  userQuotaModel,
  workspaceMemberModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { cacheConnections } from "@chatbotx.io/redis"
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

  if (userIds.length === 0) {
    return
  }

  logger.info({ count: userIds.length }, "user-quota: syncing quota for users")

  // Process in batches to avoid overwhelming the DB
  const BATCH_SIZE = 50
  for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
    const batch = userIds.slice(i, i + BATCH_SIZE)
    await Promise.all(batch.map(reconcileUser))
  }
}

export const reconcileUser = async (userId: string): Promise<void> => {
  try {
    const client = await cacheConnections.useExisting()

    const [
      [contactsResult],
      [teamMembersResult],
      [workspacesResult],
      [channelsResult],
    ] = await Promise.all([
      db
        .select({ count: count() })
        .from(contactModel)
        .innerJoin(
          workspaceModel,
          eq(contactModel.workspaceId, workspaceModel.id),
        )
        .where(eq(workspaceModel.ownerId, userId)),

      db
        .select({ count: count() })
        .from(workspaceMemberModel)
        .innerJoin(
          workspaceModel,
          eq(workspaceMemberModel.workspaceId, workspaceModel.id),
        )
        .where(
          and(
            eq(workspaceModel.ownerId, userId),
            ne(workspaceMemberModel.role, "owner"),
          ),
        ),

      db
        .select({ count: count() })
        .from(workspaceModel)
        .where(eq(workspaceModel.ownerId, userId)),

      db
        .select({ count: count() })
        .from(inboxModel)
        .innerJoin(
          workspaceModel,
          eq(inboxModel.workspaceId, workspaceModel.id),
        )
        .where(eq(workspaceModel.ownerId, userId)),
    ])

    const contactsUsed = contactsResult?.count ?? 0
    const teamMembersUsed = teamMembersResult?.count ?? 0
    const workspacesUsed = workspacesResult?.count ?? 0
    const channelsUsed = channelsResult?.count ?? 0

    await db
      .insert(userQuotaModel)
      .values({
        userId,
        contactsUsed,
        teamMembersUsed,
        workspacesUsed,
        channelsUsed,
        syncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userQuotaModel.userId,
        set: {
          // Authoritative current count from the source tables (already reflects
          // deletions). Assigned directly — NOT GREATEST — so removing contacts,
          // team members, workspaces, or channels frees quota. A transiently-low
          // COUNT racing an in-flight insert self-corrects on the next sync; that
          // brief window is far better than a high-water max that never decreases.
          contactsUsed,
          teamMembersUsed,
          workspacesUsed,
          channelsUsed,
          syncedAt: new Date(),
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
      })

    // Mirror the live counters to the same authoritative current counts.
    await client.hset(
      liveKeyFor(USER_QUOTA_LABEL, userId),
      "contacts",
      String(contactsUsed),
      "teamMembers",
      String(teamMembersUsed),
      "workspaces",
      String(workspacesUsed),
      "channels",
      String(channelsUsed),
    )

    // mac is monotonic-within-period and lives only on the quota row, so read it
    // back (alongside the billing period) for the separate mac reconcile.
    // `periodEnd === null` marks a lifetime plan, which never resets.
    const stored = await db.query.userQuotaModel.findFirst({
      where: { userId },
      columns: { macUsed: true, periodStart: true, periodEnd: true },
    })

    await reconcileMac(
      userId,
      client,
      stored?.macUsed ?? 0,
      stored?.periodStart?.toISOString() ?? "",
      stored?.periodEnd == null,
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
  await db
    .insert(userQuotaModel)
    .values({ userId, macUsed: value, syncedAt: new Date() })
    .onConflictDoUpdate({
      target: userQuotaModel.userId,
      set: {
        macUsed: value,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      },
    })
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
