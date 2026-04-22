import { db } from "@chatbotx.io/database/client"
import {
  type BloomFilter,
  bloomFilter,
  distributedStore,
} from "@chatbotx.io/redis"
import { logger } from "../lib/logger"
import {
  calcEndOfDayTtl,
  formatLocalDate,
  macCountCacheKey,
  type PeriodBounds,
  periodContaining,
  truncateHourInTimezone,
} from "../lib/mac-period"
import {
  type MonthlyCounterRow,
  macRepository,
  type PreparedRow,
} from "../repositories/mac.repository"
import {
  MAC_EVENT_TYPE_CODE,
  type MacCountCacheValue,
  type MacInputEvent,
  type MacMessageInPayload,
  type MacMessageOutPayload,
} from "../schemas/mac"

const DEFAULT_TIMEZONE = "UTC"
const DEFAULT_ANCHOR_DAY = 1

const BLOOM_FILTER_BUFFER_SECONDS = 900
const BLOOM_FILTER_CAPACITY = 1_000_000
const BLOOM_FILTER_ERROR_RATE = 0.001

function formatHourBucket(date: Date): string {
  return date.toISOString().slice(0, 13).replace(/[-T:]/g, "")
}

function calcBloomFilterTtl(now: Date): number {
  const secondsIntoHour = now.getUTCMinutes() * 60 + now.getUTCSeconds()
  const secondsUntilNextHour = 3600 - secondsIntoHour
  return secondsUntilNextHour + BLOOM_FILTER_BUFFER_SECONDS
}

export class MacTrackingService {
  private bloomFilterInstance: BloomFilter = bloomFilter

  setBloomFilter(bf: BloomFilter): void {
    this.bloomFilterInstance = bf
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
    for (const p of validPayloads) {
      events.push({
        workspaceId: p.context.workspaceId,
        contactId: p.context.contactId,
        contactInboxId: p.context.contactInboxId as string,
        inboxId: p.context.inboxId as string,
        eventType: "message_out",
        occurredAt: new Date(p.occurredAt),
        sourceId: p.action.sourceId ?? p.action.messageId,
      })
    }
    await this.track(events)
  }

  async trackMessageIn(payloads: MacMessageInPayload[]): Promise<void> {
    if (payloads.length === 0) {
      return
    }

    const events: MacInputEvent[] = []
    for (const p of payloads) {
      events.push({
        workspaceId: p.workspaceId,
        contactId: p.contactId,
        contactInboxId: p.contactInboxId as string,
        inboxId: p.inboxId as string,
        eventType: "message_in",
        occurredAt: p.occurredAt,
        sourceId: p.sourceId ?? undefined,
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
      return
    }

    const rowMap = new Map<string, PreparedRow>()
    for (const e of deduped) {
      const bounds: PeriodBounds = periodContaining(
        e.occurredAt,
        DEFAULT_TIMEZONE,
        DEFAULT_ANCHOR_DAY,
      )

      const hourBucket = truncateHourInTimezone(e.occurredAt, DEFAULT_TIMEZONE)
      const key = `${e.workspaceId}|${e.contactInboxId}|${e.eventType}|${hourBucket.getTime()}`
      const existing = rowMap.get(key)
      if (existing && existing.occurredAt.getTime() >= e.occurredAt.getTime()) {
        continue
      }

      rowMap.set(key, {
        workspaceId: e.workspaceId,
        contactId: e.contactId,
        contactInboxId: e.contactInboxId as string,
        inboxId: e.inboxId as string,
        eventType: MAC_EVENT_TYPE_CODE[e.eventType],
        occurredAt: e.occurredAt,
        hourBucket,
        localDate: formatLocalDate(e.occurredAt, DEFAULT_TIMEZONE),
        localPeriodStart: bounds.start,
        localPeriodEnd: bounds.end,
        billingId: "0",
      })
    }
    const rows = Array.from(rowMap.values())

    await Promise.all([this.runActivityHourly(rows), this.runMonthlyPath(rows)])
  }

  private async filterDuplicateSources(
    events: MacInputEvent[],
  ): Promise<MacInputEvent[]> {
    const eventsWithContactInbox = events.filter((e) => e.contactInboxId)

    if (eventsWithContactInbox.length === 0) {
      return events
    }

    const now = new Date()
    const hourKey = `mac:dedup:${formatHourBucket(now)}`
    const items = eventsWithContactInbox.map(
      (e) => `${e.workspaceId}:${e.contactInboxId}:${e.eventType}`,
    )

    try {
      const results = await this.bloomFilterInstance.addMany(hourKey, items, {
        errorRate: BLOOM_FILTER_ERROR_RATE,
        capacity: BLOOM_FILTER_CAPACITY,
        ttlSeconds: calcBloomFilterTtl(now),
      })

      const keptWithContactInbox = eventsWithContactInbox.filter(
        (_, i) => results[i],
      )

      return keptWithContactInbox
    } catch (error) {
      logger.error(error, "[MacTrackingService] bloom filter dedup failed")
      return events
    }
  }

  private async runActivityHourly(rows: PreparedRow[]): Promise<void> {
    try {
      await macRepository.upsertActivityHourly(rows)
    } catch (error) {
      logger.error(error, "[MacTrackingService] upsertActivityHourly failed")
    }
  }

  private async runMonthlyPath(rows: PreparedRow[]): Promise<void> {
    try {
      const counterRows = await db.transaction(async (tx) => {
        const deltas = await macRepository.upsertMonthlyPresence(rows, tx)
        return await macRepository.incrementMonthlyCounters(deltas, tx)
      })
      await this.refreshMonthlyCountCache(counterRows)
    } catch (error) {
      logger.error(error, "[MacTrackingService] monthly path failed")
    }
  }

  private async refreshMonthlyCountCache(
    counterRows: MonthlyCounterRow[],
  ): Promise<void> {
    if (counterRows.length === 0) {
      return
    }

    const entries = counterRows.map((row) => ({
      key: macCountCacheKey(row.workspaceId, row.billingId),
      value: {
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        macCount: row.macCount,
      } satisfies MacCountCacheValue,
      ttlInSeconds: calcEndOfDayTtl(),
    }))

    try {
      await distributedStore.putMany(entries)
    } catch (error) {
      logger.error(
        error,
        "[MacTrackingService] bulk cache set failed for mac count",
      )
    }
  }
}

export const macTrackingService = new MacTrackingService()
