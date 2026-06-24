import { and, type DatabaseClient, db, eq } from "@chatbotx.io/database/client"
import {
  userQuotaModel,
  workspaceMemberModel,
} from "@chatbotx.io/database/schema"
import {
  type BloomFilter,
  bloomFilter,
  cacheConnections,
  distributedStore,
} from "@chatbotx.io/redis"
import { logger } from "../lib/logger"
import {
  anchoredPeriod,
  calcEndOfDayTtl,
  truncateHourInTimezone,
  workspaceMacCacheKey,
} from "../lib/mac-period"
import {
  type CountDelta,
  macRepository,
  type PreparedRow,
  type WorkspaceMacDelta,
  workspaceMacKey,
} from "../repositories/postgres/mac.repository"
import {
  MAC_EVENT_TYPE_CODE,
  type MacInputEvent,
  type MacMessageInPayload,
  type MacMessageOutPayload,
} from "../schemas/mac"

const DEFAULT_TIMEZONE = "UTC"

function coerceOccurredAt(value: unknown): Date {
  const date = value instanceof Date ? value : new Date(value as string)
  if (Number.isNaN(date.getTime())) {
    logger.warn(
      { value },
      "[MacTrackingService] invalid occurredAt, falling back to now()",
    )
    return new Date()
  }
  return date
}

const BLOOM_FILTER_MINUTE_BUFFER_SECONDS = 60
const BLOOM_FILTER_CAPACITY = 1_000_000
const BLOOM_FILTER_ERROR_RATE = 0.001

type QuotaContext = {
  userId: string
  periodStart: Date
}

type QuotaContextCacheValue = {
  userId: string
  periodStart: string
}

type DraftRow = Omit<PreparedRow, "workspaceMacId">

function quotaContextCacheKey(workspaceId: string): string {
  return `mac:ctx:ws:${workspaceId}`
}

function formatMinuteBucket(date: Date): string {
  return date.toISOString().slice(0, 16).replace(/[-T:]/g, "")
}

function calcBloomFilterTtl(now: Date): number {
  const secondsUntilNextMinute = 60 - now.getUTCSeconds()
  return secondsUntilNextMinute + BLOOM_FILTER_MINUTE_BUFFER_SECONDS
}

export class MacTrackingService {
  private bloomFilterInstance: BloomFilter = bloomFilter

  setBloomFilter(filter: BloomFilter): void {
    this.bloomFilterInstance = filter
  }

  async trackMessageOut(payloads: MacMessageOutPayload[]): Promise<void> {
    if (payloads.length === 0) {
      return
    }
    const validPayloads = payloads.filter((p) => p.context.contactInboxId)
    if (validPayloads.length === 0) {
      return
    }

    const events: MacInputEvent[] = []
    for (const payload of validPayloads) {
      events.push({
        workspaceId: payload.context.workspaceId,
        contactId: payload.context.contactId,
        contactInboxId: payload.context.contactInboxId as string,
        inboxId: payload.context.inboxId as string,
        eventType: "message_out",
        occurredAt: coerceOccurredAt(payload.occurredAt),
        sourceId: payload.action.sourceId ?? payload.action.messageId,
      })
    }
    await this.track(events)
  }

  async trackMessageIn(payloads: MacMessageInPayload[]): Promise<void> {
    if (payloads.length === 0) {
      return
    }

    const events: MacInputEvent[] = []
    for (const payload of payloads) {
      events.push({
        workspaceId: payload.workspaceId,
        contactId: payload.contactId,
        contactInboxId: payload.contactInboxId as string,
        inboxId: payload.inboxId as string,
        eventType: "message_in",
        occurredAt: coerceOccurredAt(payload.occurredAt),
        sourceId: payload.sourceId ?? undefined,
      })
    }
    await this.track(events)
  }

  /**
   * Synchronously claim one monthly-active-contact slot for a *brand-new*
   * contact at creation time, inside the caller's transaction. This is the
   * write-time half of MAC enforcement: it records the same
   * `ContactActiveMonthly` presence row and `WorkspaceMac` rollup that the
   * async `trackMessageIn`/`trackMessageOut` path would, so a later
   * `message:received`/`message:sent` event for this same contact dedups via
   * `onConflictDoNothing` and does NOT double-count.
   *
   * Returns `{ counted: true }` only when a presence row was newly inserted.
   * Because the contact (and its `contactInbox`) is brand-new, a conflict
   * should not occur; the guard is purely defensive. Does NOT touch the
   * user/pool live quota counters — that is the caller's responsibility
   * (`quotaEnforcementService.incrementBy`), which also handles tenancy.
   */
  async claimNewActiveContact(
    input: {
      workspaceId: string
      contactId: string
      contactInboxId: string
      inboxId: string
      /** Owner billing-period anchor (`UserQuota.periodStart`). */
      periodStart: Date
      occurredAt: Date
    },
    tx: DatabaseClient = db,
  ): Promise<{ counted: boolean }> {
    const { counted } = await this.claimNewActiveContacts(
      {
        workspaceId: input.workspaceId,
        inboxId: input.inboxId,
        periodStart: input.periodStart,
        occurredAt: input.occurredAt,
        contacts: [
          { contactId: input.contactId, contactInboxId: input.contactInboxId },
        ],
      },
      tx,
    )
    return { counted: counted > 0 }
  }

  /**
   * Batch variant of {@link claimNewActiveContact} for bulk creation (e.g.
   * contact import): records the `ContactActiveMonthly` presence rows + the
   * `WorkspaceMac` rollup for many brand-new contacts of one workspace in a
   * single round-trip, inside the caller's transaction. Returns the number of
   * presence rows newly inserted (`onConflictDoNothing` dedups any already
   * active this period). Keeps the import-created contacts in the same ledger
   * the quota reconcile derives `macUsed` from.
   */
  async claimNewActiveContacts(
    input: {
      workspaceId: string
      inboxId: string
      /** Owner billing-period anchor (`UserQuota.periodStart`). */
      periodStart: Date
      occurredAt: Date
      contacts: { contactId: string; contactInboxId: string }[]
    },
    tx: DatabaseClient = db,
  ): Promise<{ counted: number }> {
    if (input.contacts.length === 0) {
      return { counted: 0 }
    }

    const { start, end } = anchoredPeriod(input.occurredAt, input.periodStart)

    const macIdByKey = await macRepository.ensureWorkspaceMac(
      [{ workspaceId: input.workspaceId, periodStart: start, periodEnd: end }],
      tx,
    )
    const workspaceMacId = macIdByKey.get(
      workspaceMacKey(input.workspaceId, start, end),
    )
    if (!workspaceMacId) {
      return { counted: 0 }
    }

    const hourBucket = truncateHourInTimezone(
      input.occurredAt,
      DEFAULT_TIMEZONE,
    )
    const deltas = await macRepository.upsertMonthlyPresence(
      input.contacts.map((contact) => ({
        workspaceId: input.workspaceId,
        contactId: contact.contactId,
        contactInboxId: contact.contactInboxId,
        inboxId: input.inboxId,
        eventType: MAC_EVENT_TYPE_CODE.message_in,
        occurredAt: input.occurredAt,
        hourBucket,
        periodStart: start,
        periodEnd: end,
        workspaceMacId,
      })),
      tx,
    )
    if (deltas.length === 0) {
      return { counted: 0 }
    }

    await macRepository.addWorkspaceMacCount(
      deltas.map((delta) => ({ id: delta.workspaceMacId, count: delta.count })),
      tx,
    )
    return { counted: deltas.reduce((sum, delta) => sum + delta.count, 0) }
  }

  /**
   * Bump the workspace-level MAC display cache by `delta`, mirroring the
   * async path's `incrementCaches`. Best-effort: a failure only makes the
   * analytics display briefly stale until its end-of-day TTL or the next
   * event, since the durable `WorkspaceMac.macCount` was already updated.
   */
  async incrementWorkspaceMacCache(
    workspaceId: string,
    delta: number,
  ): Promise<void> {
    if (delta <= 0) {
      return
    }
    try {
      await distributedStore.incrementCounter(
        workspaceMacCacheKey(workspaceId),
        delta,
        calcEndOfDayTtl(),
      )
    } catch (error) {
      logger.warn(
        { err: error, workspaceId, delta },
        "[MacTrackingService] workspace MAC cache increment failed",
      )
    }
  }

  async track(events: MacInputEvent[]): Promise<void> {
    if (events.length === 0) {
      return
    }

    const deduped = await this.filterDuplicateSources(events)
    if (deduped.length === 0) {
      return
    }

    const workspaceIds = Array.from(new Set(deduped.map((e) => e.workspaceId)))
    const contextByWorkspace =
      await this.getQuotaContextByWorkspaceId(workspaceIds)

    const draftByKey = new Map<string, DraftRow>()
    for (const event of deduped) {
      const context = contextByWorkspace.get(event.workspaceId)
      if (!context) {
        logger.debug(
          { workspaceId: event.workspaceId },
          "[MacTrackingService] no quota context, skipping event",
        )
        continue
      }

      const { start, end } = anchoredPeriod(
        event.occurredAt,
        context.periodStart,
      )
      const hourBucket = truncateHourInTimezone(
        event.occurredAt,
        DEFAULT_TIMEZONE,
      )

      const dedupKey = `${event.workspaceId}|${event.contactInboxId}|${event.eventType}|${hourBucket.getTime()}`
      const existingDraft = draftByKey.get(dedupKey)
      if (
        existingDraft &&
        existingDraft.occurredAt.getTime() >= event.occurredAt.getTime()
      ) {
        continue
      }

      draftByKey.set(dedupKey, {
        workspaceId: event.workspaceId,
        contactId: event.contactId,
        contactInboxId: event.contactInboxId as string,
        inboxId: event.inboxId as string,
        eventType: MAC_EVENT_TYPE_CODE[event.eventType],
        occurredAt: event.occurredAt,
        hourBucket,
        periodStart: start,
        periodEnd: end,
      })
    }

    const draftRows = Array.from(draftByKey.values())
    if (draftRows.length === 0) {
      return
    }

    const rows = await this.resolveMacIds(draftRows)
    if (rows.length === 0) {
      return
    }

    await this.persistMonthlyRollup(rows, contextByWorkspace)
  }

  private async resolveMacIds(drafts: DraftRow[]): Promise<PreparedRow[]> {
    const workspaceMacIdByKey = await macRepository.ensureWorkspaceMac(
      drafts.map((draft) => ({
        workspaceId: draft.workspaceId,
        periodStart: draft.periodStart,
        periodEnd: draft.periodEnd,
      })),
    )

    const rows: PreparedRow[] = []
    for (const draft of drafts) {
      const key = workspaceMacKey(
        draft.workspaceId,
        draft.periodStart,
        draft.periodEnd,
      )
      const workspaceMacId = workspaceMacIdByKey.get(key)
      if (!workspaceMacId) {
        continue
      }
      rows.push({ ...draft, workspaceMacId })
    }
    return rows
  }

  private async getQuotaContextByWorkspaceId(
    workspaceIds: string[],
  ): Promise<Map<string, QuotaContext>> {
    const result = new Map<string, QuotaContext>()
    if (workspaceIds.length === 0) {
      return result
    }

    const cacheKeys = workspaceIds.map(quotaContextCacheKey)
    let cached: Record<string, QuotaContextCacheValue | null> = {}
    try {
      cached =
        (await distributedStore.getAll<QuotaContextCacheValue>(cacheKeys)) || {}
    } catch (error) {
      logger.error(error, "[MacTrackingService] quota context cache get failed")
      cached = {}
    }

    const missing: string[] = []
    for (const workspaceId of workspaceIds) {
      const cachedContext = cached[quotaContextCacheKey(workspaceId)]
      if (cachedContext) {
        result.set(workspaceId, {
          userId: cachedContext.userId,
          periodStart: new Date(cachedContext.periodStart),
        })
      } else {
        missing.push(workspaceId)
      }
    }

    if (missing.length === 0) {
      return result
    }

    const rows = await Promise.all(
      missing.map(async (workspaceId) => {
        const row = await db
          .select({
            workspaceId: workspaceMemberModel.workspaceId,
            userId: workspaceMemberModel.userId,
            periodStart: userQuotaModel.periodStart,
          })
          .from(workspaceMemberModel)
          .innerJoin(
            userQuotaModel,
            eq(userQuotaModel.userId, workspaceMemberModel.userId),
          )
          .where(
            and(
              eq(workspaceMemberModel.workspaceId, workspaceId),
              eq(workspaceMemberModel.role, "owner"),
            ),
          )
          .limit(1)
        return row ? row[0] : null
      }),
    )

    const cacheEntries: Array<{
      key: string
      value: unknown
      ttlInSeconds: number
    }> = []
    for (const row of rows) {
      if (!row?.periodStart) {
        continue
      }
      const context: QuotaContext = {
        userId: row.userId,
        periodStart: row.periodStart,
      }
      result.set(row.workspaceId, context)
      cacheEntries.push({
        key: quotaContextCacheKey(row.workspaceId),
        value: {
          userId: context.userId,
          periodStart: context.periodStart.toISOString(),
        } satisfies QuotaContextCacheValue,
        ttlInSeconds: calcBloomFilterTtl(new Date()),
      })
    }

    if (cacheEntries.length > 0) {
      try {
        await distributedStore.putMany(cacheEntries)
      } catch (error) {
        logger.error(
          error,
          "[MacTrackingService] quota context cache set failed",
        )
      }
    }

    return result
  }

  private async filterDuplicateSources(
    events: MacInputEvent[],
  ): Promise<MacInputEvent[]> {
    const eventsWithContactInbox = events.filter((e) => e.contactInboxId)

    if (eventsWithContactInbox.length === 0) {
      return events
    }

    const now = new Date()
    const minuteKey = `mac:dedup:${formatMinuteBucket(now)}`
    const items = eventsWithContactInbox.map(
      (event) =>
        `${event.workspaceId}:${event.contactInboxId}:${event.eventType}`,
    )

    try {
      const results = await this.bloomFilterInstance.addMany(minuteKey, items, {
        errorRate: BLOOM_FILTER_ERROR_RATE,
        capacity: BLOOM_FILTER_CAPACITY,
        ttlSeconds: calcBloomFilterTtl(now),
      })

      return eventsWithContactInbox.filter((_, index) => results[index])
    } catch (error) {
      logger.error(error, "[MacTrackingService] bloom filter dedup failed")
      return events
    }
  }

  private async persistMonthlyRollup(
    rows: PreparedRow[],
    contextByWorkspace: Map<string, QuotaContext>,
  ): Promise<void> {
    const workspaceIdByMacId = new Map<string, string>()
    for (const row of rows) {
      workspaceIdByMacId.set(row.workspaceMacId, row.workspaceId)
    }

    try {
      const deltas = await db.transaction(async (tx) => {
        const workspaceDeltas = await macRepository.upsertMonthlyPresence(
          rows,
          tx,
        )
        if (workspaceDeltas.length === 0) {
          return [] as WorkspaceMacDelta[]
        }

        const workspaceCountDeltas: CountDelta[] = workspaceDeltas.map(
          (delta) => ({ id: delta.workspaceMacId, count: delta.count }),
        )

        await macRepository.addWorkspaceMacCount(workspaceCountDeltas, tx)
        return workspaceDeltas
      })

      await this.incrementCaches(deltas, workspaceIdByMacId, contextByWorkspace)
    } catch (error) {
      logger.error(error, "[MacTrackingService] monthly path failed")
    }
  }

  private async incrementCaches(
    deltas: WorkspaceMacDelta[],
    workspaceIdByMacId: Map<string, string>,
    contextByWorkspace: Map<string, QuotaContext>,
  ): Promise<void> {
    if (deltas.length === 0) {
      return
    }

    const workspaceTotals = new Map<string, number>()
    const userTotals = new Map<string, number>()
    for (const delta of deltas) {
      const workspaceId = workspaceIdByMacId.get(delta.workspaceMacId)
      if (!workspaceId) {
        continue
      }
      workspaceTotals.set(
        workspaceId,
        (workspaceTotals.get(workspaceId) ?? 0) + delta.count,
      )
      const context = contextByWorkspace.get(workspaceId)
      if (context) {
        userTotals.set(
          context.userId,
          (userTotals.get(context.userId) ?? 0) + delta.count,
        )
      }
    }

    const ttl = calcEndOfDayTtl()
    const ops: Promise<unknown>[] = []
    for (const [workspaceId, delta] of workspaceTotals) {
      if (delta === 0) {
        continue
      }
      ops.push(
        distributedStore.incrementCounter(
          workspaceMacCacheKey(workspaceId),
          delta,
          ttl,
        ),
      )
    }

    for (const [userId, delta] of userTotals) {
      if (delta === 0) {
        continue
      }
      ops.push(this.incrementUserQuotaMac(userId, delta))
    }

    try {
      await Promise.all(ops)
    } catch (error) {
      logger.error(error, "[MacTrackingService] INCRBY cache update failed")
    }
  }
  private async incrementUserQuotaMac(
    userId: string,
    count: number,
  ): Promise<void> {
    try {
      const client = await cacheConnections.useExisting()
      const key = `user-quota-live:${userId}`
      await client.hincrby(key, "mac", count)
    } catch (err) {
      logger.warn(
        { err, userId, count },
        "[MacTrackingService] user quota mac increment failed",
      )
    }
  }
}

export const macTrackingService = new MacTrackingService()
