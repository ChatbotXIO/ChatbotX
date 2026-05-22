import {
  and,
  db,
  desc,
  eq,
  gt,
  isNull,
  lte,
  or,
  sql,
} from "@chatbotx.io/database/client"
import {
  billingModel,
  workspaceMemberModel,
} from "@chatbotx.io/database/schema"
import {
  type BloomFilter,
  bloomFilter,
  distributedStore,
} from "@chatbotx.io/redis"
import { logger } from "../lib/logger"
import {
  anchoredPeriod,
  billingMacCacheKey,
  calcEndOfDayTtl,
  truncateHourInTimezone,
  workspaceMacCacheKey,
} from "../lib/mac-period"
import {
  billingMacKey,
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

/**
 * Normalize an event timestamp to a valid `Date`. A malformed or missing
 * `occurredAt` (`new Date(undefined)` etc.) yields an Invalid Date, which would
 * later produce NaN period bounds and crash `billingMacKey` with
 * `RangeError: Invalid time value`. The activity is real, so we keep the event
 * and fall back to `now()` rather than dropping a billable MAC count.
 */
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

type BillingContext = {
  billingId: string
  billingPeriodStart: Date
}

type BillingContextCacheValue = {
  billingId: string
  billingPeriodStart: string
}

/**
 * A contact event with its anchored period resolved, but before the
 * `BillingMac`/`WorkspaceMac` id chain is attached. `resolveMacIds` turns these
 * into `PreparedRow`s.
 */
type DraftRow = Omit<PreparedRow, "billingMacId" | "workspaceMacId">

/** Links a resolved `WorkspaceMac` id back to its workspace and billing ids. */
type MacIdChain = {
  workspaceId: string
  billingId: string
  billingMacId: string
}

function billingContextCacheKey(workspaceId: string): string {
  return `mac:ctx:ws:${workspaceId}`
}

/**
 * Minute bucket key (YYYYMMDDHHMM) for bloom-filter dedup. Matches the
 * minute-aligned `calcBloomFilterTtl` so the key and its TTL cover the same
 * window — an hour bucket would outlive its ~1-minute TTL and dedup
 * inconsistently within the hour.
 */
function formatMinuteBucket(date: Date): string {
  return date.toISOString().slice(0, 16).replace(/[-T:]/g, "")
}

/**
 * Minute-aligned bloom filter TTL: time left in the current minute plus a
 * buffer, so late events in the same minute still dedup against the filter.
 */
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

  async track(events: MacInputEvent[]): Promise<void> {
    if (events.length === 0) {
      return
    }

    const deduped = await this.filterDuplicateSources(events)
    if (deduped.length === 0) {
      // return
    }

    const workspaceIds = Array.from(new Set(deduped.map((e) => e.workspaceId)))
    const contextByWorkspace = await this.getBillingByWorkspaceId(workspaceIds)

    // No-billing rule: an event whose workspace has no active Billing record is
    // dropped here. MAC tracking does nothing for such workspaces — no contact
    // rows, no BillingMac/WorkspaceMac, no cache writes. Absence of Billing is
    // expected for newly created workspaces, so this is a debug log, not a warn.
    const draftByKey = new Map<string, DraftRow>()
    for (const event of deduped) {
      const context = contextByWorkspace.get(event.workspaceId)
      if (!context) {
        logger.debug(
          { workspaceId: event.workspaceId },
          "[MacTrackingService] no billing record, skipping event",
        )
        continue
      }

      const { start, end } = anchoredPeriod(
        event.occurredAt,
        context.billingPeriodStart,
      )
      const hourBucket = truncateHourInTimezone(
        event.occurredAt,
        DEFAULT_TIMEZONE,
      )

      // Collapse events that share an hour bucket; keep the latest one.
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
        billingId: context.billingId,
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

    await this.persistMonthlyRollup(rows)
  }

  /**
   * Resolves the `Billing -> BillingMac -> WorkspaceMac` id chain for each
   * draft row. `BillingMac` rows are ensured for every distinct
   * `(billingId, periodStart, periodEnd)`, then `WorkspaceMac` rows for every
   * distinct `(workspaceId, billingMacId)`. Both contact tables carry
   * `workspaceMacId`, so this must run before any contact row is written.
   */
  private async resolveMacIds(drafts: DraftRow[]): Promise<PreparedRow[]> {
    const billingMacIdByKey = await macRepository.ensureBillingMac(
      drafts.map((draft) => ({
        billingId: draft.billingId,
        periodStart: draft.periodStart,
        periodEnd: draft.periodEnd,
      })),
    )

    const workspaceMacEntries: { workspaceId: string; billingMacId: string }[] =
      []
    for (const draft of drafts) {
      const billingMacId = billingMacIdByKey.get(
        billingMacKey(draft.billingId, draft.periodStart, draft.periodEnd),
      )
      if (billingMacId) {
        workspaceMacEntries.push({
          workspaceId: draft.workspaceId,
          billingMacId,
        })
      }
    }

    const workspaceMacIdByKey =
      await macRepository.ensureWorkspaceMac(workspaceMacEntries)

    const rows: PreparedRow[] = []
    for (const draft of drafts) {
      const billingMacId = billingMacIdByKey.get(
        billingMacKey(draft.billingId, draft.periodStart, draft.periodEnd),
      )
      if (!billingMacId) {
        continue
      }
      const workspaceMacId = workspaceMacIdByKey.get(
        workspaceMacKey(draft.workspaceId, billingMacId),
      )
      if (!workspaceMacId) {
        continue
      }
      rows.push({ ...draft, billingMacId, workspaceMacId })
    }
    return rows
  }

  private async getBillingByWorkspaceId(
    workspaceIds: string[],
  ): Promise<Map<string, BillingContext>> {
    const result = new Map<string, BillingContext>()
    if (workspaceIds.length === 0) {
      return result
    }

    const cacheKeys = workspaceIds.map(billingContextCacheKey)
    let cached: Record<string, BillingContextCacheValue | null> = {}
    try {
      // await distributedStore.delete(cacheKeys)
      cached =
        (await distributedStore.getAll<BillingContextCacheValue>(cacheKeys)) ||
        {}
    } catch (error) {
      logger.error(
        error,
        "[MacTrackingService] billing context cache get failed",
      )
      cached = {}
    }

    const missing: string[] = []
    for (const workspaceId of workspaceIds) {
      const cachedContext = cached[billingContextCacheKey(workspaceId)]
      if (cachedContext) {
        result.set(workspaceId, {
          billingId: cachedContext.billingId,
          // The cache stores `billingPeriodStart` as an ISO string.
          billingPeriodStart: new Date(cachedContext.billingPeriodStart),
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
        // Resolve the workspace owner, then the latest active Billing record
        // whose [periodStart, periodEnd) window contains now().
        const row = await db
          .select({
            workspaceId: workspaceMemberModel.workspaceId,
            billingId: billingModel.id,
            billingPeriodStart: billingModel.periodStart,
          })
          .from(workspaceMemberModel)
          .innerJoin(
            billingModel,
            eq(billingModel.userId, workspaceMemberModel.userId),
          )
          .where(
            and(
              eq(workspaceMemberModel.workspaceId, workspaceId),
              eq(workspaceMemberModel.role, "owner"),
              and(
                lte(billingModel.periodStart, sql`now()`),
                or(
                  isNull(billingModel.periodEnd),
                  gt(billingModel.periodEnd, sql`now()`),
                ),
              ),
            ),
          )
          .orderBy(desc(billingModel.id))
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
      if (!row) {
        continue
      }
      // `billingModel.periodStart` is a `mode: "date"` column, so the query
      // builder returns a real `Date` here.
      const context: BillingContext = {
        billingId: row.billingId,
        billingPeriodStart: row.billingPeriodStart,
      }
      result.set(row.workspaceId, context)
      cacheEntries.push({
        key: billingContextCacheKey(row.workspaceId),
        value: {
          billingId: context.billingId,
          billingPeriodStart: context.billingPeriodStart.toISOString(),
        } satisfies BillingContextCacheValue,
        ttlInSeconds: calcBloomFilterTtl(new Date()),
      })
    }

    if (cacheEntries.length > 0) {
      try {
        await distributedStore.putMany(cacheEntries)
      } catch (error) {
        logger.error(
          error,
          "[MacTrackingService] billing context cache set failed",
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

  private async persistMonthlyRollup(rows: PreparedRow[]): Promise<void> {
    // Map each WorkspaceMac id back to its workspace/billing identifiers so the
    // new-contact counts can fan out to BillingMac and the count caches.
    const chainByWorkspaceMacId = new Map<string, MacIdChain>()
    for (const row of rows) {
      chainByWorkspaceMacId.set(row.workspaceMacId, {
        workspaceId: row.workspaceId,
        billingId: row.billingId,
        billingMacId: row.billingMacId,
      })
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
        const billingCountDeltas: CountDelta[] = []
        for (const delta of workspaceDeltas) {
          const chain = chainByWorkspaceMacId.get(delta.workspaceMacId)
          if (chain) {
            billingCountDeltas.push({
              id: chain.billingMacId,
              count: delta.count,
            })
          }
        }

        await Promise.all([
          macRepository.addWorkspaceMacCount(workspaceCountDeltas, tx),
          macRepository.addBillingMacCount(billingCountDeltas, tx),
        ])
        return workspaceDeltas
      })
      await this.incrementMonthlyCountCache(deltas, chainByWorkspaceMacId)
    } catch (error) {
      logger.error(error, "[MacTrackingService] monthly path failed")
    }
  }

  private async incrementMonthlyCountCache(
    deltas: WorkspaceMacDelta[],
    chainByWorkspaceMacId: Map<string, MacIdChain>,
  ): Promise<void> {
    if (deltas.length === 0) {
      return
    }

    const workspaceTotals = new Map<string, number>()
    const billingTotals = new Map<string, number>()
    for (const delta of deltas) {
      const chain = chainByWorkspaceMacId.get(delta.workspaceMacId)
      if (!chain) {
        continue
      }
      workspaceTotals.set(
        chain.workspaceId,
        (workspaceTotals.get(chain.workspaceId) ?? 0) + delta.count,
      )
      billingTotals.set(
        chain.billingId,
        (billingTotals.get(chain.billingId) ?? 0) + delta.count,
      )
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
    for (const [billingId, delta] of billingTotals) {
      if (delta === 0) {
        continue
      }
      ops.push(
        distributedStore.incrementCounter(
          billingMacCacheKey(billingId),
          delta,
          ttl,
        ),
      )
    }

    try {
      await Promise.all(ops)
    } catch (error) {
      logger.error(error, "[MacTrackingService] INCRBY cache update failed")
    }
  }
}

export const macTrackingService = new MacTrackingService()
