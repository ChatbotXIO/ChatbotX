import { contactRepository } from "@chatbotx.io/database/repositories"
import type { MessageFailedPayload } from "@chatbotx.io/flow-config"
import { invalidateCacheByTags, withCache } from "@chatbotx.io/redis"
import { parsedErrorSchema } from "@chatbotx.io/sdk"
import { toDate } from "../lib/date"
import {
  contactStatsRepository,
  type InsertContactEventRow,
} from "../repositories/postgres"
import type {
  ContactCountsSchema,
  ContactStats,
  ContactsByDimension,
  ContactsByDimensionQuery,
  TimeRangeQuery,
} from "../schemas"
import type { ContactEventType } from "../schemas/contact-event"

const USER_BLOCKED_CATEGORY = "user_blocked"
const TOTAL_CONTACTS_CACHE_TTL_SECONDS = 120

export class ContactAnalyticsService {
  recordEvents(
    payloads: InsertContactEventRow[],
    eventType: ContactEventType,
  ): Promise<void> {
    return contactStatsRepository.insertEvents(payloads, eventType)
  }

  getStatsByMinute(
    props: TimeRangeQuery & {
      eventTypes?: ContactEventType[]
    },
  ): Promise<ContactStats[]> {
    return contactStatsRepository.getStatsByMinute(props)
  }

  getStatsByHour(
    props: TimeRangeQuery & {
      eventTypes?: ContactEventType[]
    },
  ): Promise<ContactStats[]> {
    return contactStatsRepository.getStatsByHour(props)
  }

  getStatsByDay(
    props: TimeRangeQuery & {
      eventTypes?: ContactEventType[]
    },
  ): Promise<ContactStats[]> {
    return contactStatsRepository.getStatsByDay(props)
  }

  getContactCountsPerDay(
    props: TimeRangeQuery,
  ): Promise<ContactCountsSchema[]> {
    return contactStatsRepository.getContactCountsPerDay(props)
  }

  getNewContactsPerDay(props: TimeRangeQuery): Promise<ContactCountsSchema[]> {
    return contactStatsRepository.getNewContactsPerDay(props)
  }

  getNewContactsCount(props: TimeRangeQuery): Promise<number> {
    return contactStatsRepository.getNewContactsCount(props)
  }

  getBlockedContactsPerDay(
    props: TimeRangeQuery,
  ): Promise<ContactCountsSchema[]> {
    return contactStatsRepository.getBlockedContactsPerDay(props)
  }

  getBlockedContactsCount(props: TimeRangeQuery): Promise<number> {
    return contactStatsRepository.getBlockedContactsCount(props)
  }

  getContactsCount(props: TimeRangeQuery): Promise<number> {
    return contactStatsRepository.getContactsCount(props)
  }

  getContactsByDimension(
    props: ContactsByDimensionQuery,
  ): Promise<ContactsByDimension[]> {
    if (props.metric !== "total") {
      return contactStatsRepository.getContactsByDimension(props)
    }
    // The total scans the workspace's whole history up to `to`, so it is the
    // only metric cached. `from` and the timezone do not affect it and stay out
    // of the key; short TTL, no tags, a handful of rows per entry.
    return withCache(
      `analytics:contacts-by-dimension:total:${props.workspaceId}:${props.dimension}:${props.to.toISOString()}`,
      () => contactStatsRepository.getContactsByDimension(props),
      { ttl: TOTAL_CONTACTS_CACHE_TTL_SECONDS },
    )
  }

  async handleBlocked(payloads: MessageFailedPayload[]): Promise<void> {
    const contacts = new Map<string, InsertContactEventRow>()

    for (const payload of payloads) {
      const parsed = parsedErrorSchema.safeParse(payload.errorData)
      if (!parsed.success) {
        continue
      }
      if (parsed.data.category !== USER_BLOCKED_CATEGORY) {
        continue
      }

      const contactId = payload.context.contactId
      if (contacts.has(contactId)) {
        continue
      }

      contacts.set(contactId, {
        workspaceId: payload.context.workspaceId,
        contactId,
        occurredAt: toDate(payload.occurredAt),
        channel: payload.context.channel,
        metadata: {
          triggerContext: {
            triggerSource: "worker",
            triggerHandler: "messageFailedListener",
            triggerType: "contact_blocked",
            origin: "auto_detected",
            errorCode: parsed.data.code,
            errorSubcode: parsed.data.subcode,
            errorStatusCode: parsed.data.statusCode,
            errorCategory: parsed.data.category,
          },
        },
      })
    }

    if (contacts.size === 0) {
      return
    }

    // A batch can span multiple workspaces, so the scoped write and its
    // cache invalidation run once per workspace rather than once overall.
    const idsByWorkspace = new Map<string, string[]>()
    for (const [contactId, row] of contacts) {
      const ids = idsByWorkspace.get(row.workspaceId) ?? []
      ids.push(contactId)
      idsByWorkspace.set(row.workspaceId, ids)
    }

    const transitioned: { id: string }[] = []
    for (const [workspaceId, ids] of idsByWorkspace) {
      const blocked = await contactRepository.blockManyIfNotBlocked({
        workspaceId,
        ids,
      })
      if (blocked.length === 0) {
        continue
      }
      transitioned.push(...blocked)
      await invalidateCacheByTags([
        "contacts",
        `contacts:${workspaceId}`,
        ...blocked.map((c) => `contacts:${c.id}`),
      ])
    }

    if (transitioned.length === 0) {
      return
    }

    const rows = transitioned
      .map((c) => contacts.get(c.id))
      .filter((r): r is InsertContactEventRow => r !== undefined)

    if (rows.length === 0) {
      return
    }

    await this.recordEvents(rows, "contact_blocked")
  }
}

export const contactAnalyticsService = new ContactAnalyticsService()
