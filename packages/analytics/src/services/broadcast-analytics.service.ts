import { clickhouse } from "@chatbotx.io/clickhouse/client"
import type { BroadcastStatsType } from "@chatbotx.io/clickhouse/schemas"
import { toClickHouseDateTime } from "@chatbotx.io/clickhouse/utils"
import { db, sql } from "@chatbotx.io/database/client"
import { channelTypes } from "@chatbotx.io/database/partials"
import {
  BROADCAST_PAYLOAD_TYPE,
  type BroadcastMetadataPayload,
  type FlowClickedPayload,
  FlowEventType,
  type MessageDeliveredPayload,
  MessageEventType,
  type MessageFailedPayload,
  type MessageSeenPayload,
  type MessageSentPayload,
} from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { getTime } from "date-fns"
import { broadcastStatsRepository } from "../repositories/broadcast-stats.repository"
import type {
  BroadcastEventType,
  BroadcastStats,
  BroadcastUpdateItem,
} from "../schemas/broadcast-stats"
import type { ContactEventData } from "../schemas/common"

function groupBy<T>(
  arr: T[],
  keySelector: (item: T) => string,
): Record<string, T[]> {
  return arr.reduce(
    (acc, item) => {
      const k = keySelector(item)
      if (!acc[k]) {
        acc[k] = []
      }
      acc[k].push(item)
      return acc
    },
    {} as Record<string, T[]>,
  )
}

async function saveToClickhouse(data: BroadcastStatsType[]) {
  if (data.length === 0) {
    return
  }

  try {
    await clickhouse.insert({
      table: "broadcast_events",
      values: data,
      format: "JSONEachRow",
    })
  } catch (error) {
    console.error("Failed to save broadcast stats to ClickHouse:", error)
  }
}

async function processBroadcastEvents(
  items: BroadcastUpdateItem[],
  updateField: "sentAt" | "readAt",
): Promise<void> {
  if (items.length === 0) {
    return
  }

  const broadcastIds = [...new Set(items.map((i) => i.broadcastId))]
  const contactIds = [...new Set(items.map((i) => i.contactId))]

  const unreadBroadcasts = await db.query.contactsOnBroadcastsModel.findMany({
    where: {
      broadcastId: { in: broadcastIds },
      contactId: { in: contactIds },
      isRead: false,
    },
    columns: {
      broadcastId: true,
      contactId: true,
      contactInboxId: true,
    },
  })

  if (unreadBroadcasts.length === 0) {
    return
  }

  const updateItems = unreadBroadcasts
    .map((b) => {
      const item = items.find(
        (i) => i.broadcastId === b.broadcastId && i.contactId === b.contactId,
      )
      if (!item) {
        return null
      }
      return {
        broadcastId: b.broadcastId,
        contactId: b.contactId,
        contactInboxId: b.contactInboxId,
        timestamp: item.occurredAt,
        workspaceId: item.workspaceId,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)

  if (updateItems.length > 0) {
    const cases = updateItems
      .map(
        (item) =>
          `WHEN "broadcastId" = '${item.broadcastId}' AND "contactId" = '${item.contactId}' THEN ${item.timestamp}`,
      )
      .join(" ")

    const tuples = updateItems.map(
      (i) => sql`(${i.broadcastId}, ${i.contactId})`,
    )

    if (updateField === "sentAt") {
      await db.execute(sql`
        UPDATE "ContactOnBroadcast"
        SET "sent" = true,
            "sentAt" = (CASE ${sql.raw(cases)} ELSE "sentAt" END)::text
        WHERE ("broadcastId", "contactId") IN (${sql.join(tuples, sql`, `)})
      `)
    } else {
      await db.execute(sql`
        UPDATE "ContactOnBroadcast"
        SET "readAt" = (CASE ${sql.raw(cases)} ELSE "readAt" END)::text
        WHERE ("broadcastId", "contactId") IN (${sql.join(tuples, sql`, `)})
      `)
    }
  }

  const nowReadBroadcasts = await db.query.contactsOnBroadcastsModel.findMany({
    where: {
      broadcastId: { in: broadcastIds },
      contactId: { in: contactIds },
      isRead: true,
    },
    columns: {
      broadcastId: true,
      contactId: true,
      contactInboxId: true,
      readAt: true,
    },
  })

  if (nowReadBroadcasts.length > 0) {
    const workspaceMap = new Map(
      items.map((i) => [`${i.broadcastId}-${i.contactId}`, i.workspaceId]),
    )

    const seenEvents: BroadcastStatsType[] = nowReadBroadcasts.map((b) => ({
      event_id: createId(),
      workspace_id: workspaceMap.get(`${b.broadcastId}-${b.contactId}`) ?? "",
      broadcast_id: b.broadcastId,
      contact_inbox_id: b.contactInboxId,
      contact_id: b.contactId,
      conv_id: "",
      source_id: "",
      channel: "",
      event_type: MessageEventType["message:seen"],
      content: JSON.stringify({}),
      occurred_at: toClickHouseDateTime(
        b.readAt ? new Date(Number(b.readAt)) : new Date(),
      ),
      inserted_at: toClickHouseDateTime(new Date()),
    }))
    await saveToClickhouse(seenEvents)
  }
}

export class BroadcastAnalyticsService {
  getStats(input: {
    workspaceId: string
    broadcastId: string
  }): Promise<BroadcastStats> {
    return broadcastStatsRepository.getStats(input)
  }

  getContactsFromClickHouse(input: {
    workspaceId: string
    broadcastId: string
    eventType: BroadcastEventType
    page: number
    perPage: number
  }): Promise<{
    contactInboxIds: string[]
    contactEventMap: Map<string, ContactEventData>
  }> {
    return broadcastStatsRepository.getContactsFromClickHouse(input)
  }

  async onMessageSent(payloads: MessageSentPayload[]) {
    const broadcastPayloads = payloads.filter(
      (p) =>
        p.metadata?.type === BROADCAST_PAYLOAD_TYPE &&
        p.context.channel !== channelTypes.enum.whatsapp,
    )

    if (broadcastPayloads.length === 0) {
      return
    }

    const insertedData: BroadcastStatsType[] = broadcastPayloads.map(
      (payload) => {
        const metadata = payload.metadata as BroadcastMetadataPayload
        return {
          event_id: createId(),
          workspace_id: payload.context.workspaceId,
          broadcast_id: metadata.broadcastId,
          contact_inbox_id: metadata.contactInboxId,
          contact_id: payload.context.contactId,
          conv_id: payload.context.conversationId,
          source_id: payload.action.sourceId ?? "",
          channel: payload.context.channel ?? "",
          event_type: MessageEventType["message:delivered"],
          content: JSON.stringify({}),
          occurred_at: toClickHouseDateTime(new Date(payload.occurredAt)),
          inserted_at: toClickHouseDateTime(new Date()),
        }
      },
    )

    await saveToClickhouse(insertedData)

    const updateItems: BroadcastUpdateItem[] = broadcastPayloads.map((p) => {
      const metadata = p.metadata as BroadcastMetadataPayload
      return {
        workspaceId: p.context.workspaceId,
        broadcastId: metadata.broadcastId,
        contactId: p.context.contactId,
        contactInboxId: metadata.contactInboxId,
        occurredAt: getTime(new Date(p.occurredAt)),
      }
    })

    await processBroadcastEvents(updateItems, "sentAt")
  }

  async onFailed(payloads: MessageFailedPayload[]) {
    const insertedData: BroadcastStatsType[] = []

    for (const payload of payloads) {
      if (payload.metadata?.type === BROADCAST_PAYLOAD_TYPE) {
        insertedData.push({
          event_id: createId(),
          workspace_id: payload.context.workspaceId,
          broadcast_id: payload.metadata.broadcastId,
          contact_inbox_id: payload.metadata.contactInboxId,
          contact_id: payload.context.contactId,
          conv_id: payload.context.conversationId,
          source_id: payload.action.sourceId ?? "",
          channel: payload.context.channel ?? "",
          event_type: MessageEventType["message:failed"],
          content: JSON.stringify({
            error: payload.errorData,
          }),
          occurred_at: toClickHouseDateTime(new Date(payload.occurredAt)),
          inserted_at: toClickHouseDateTime(new Date()),
        })
      }
    }

    if (insertedData.length === 0) {
      return
    }

    await saveToClickhouse(insertedData)
  }

  async onDelivered(payloads: MessageDeliveredPayload[]) {
    const insertedData: BroadcastStatsType[] = []

    for (const payload of payloads) {
      if (payload.metadata?.type === BROADCAST_PAYLOAD_TYPE) {
        insertedData.push({
          event_id: createId(),
          workspace_id: payload.context.workspaceId,
          broadcast_id: payload.metadata.broadcastId,
          contact_inbox_id: payload.metadata.contactInboxId,
          contact_id: payload.context.contactId,
          conv_id: payload.context.conversationId,
          source_id: payload.action.sourceId ?? "",
          channel: payload.context.channel ?? "",
          event_type: MessageEventType["message:delivered"],
          content: JSON.stringify({}),
          occurred_at: toClickHouseDateTime(new Date(payload.occurredAt)),
          inserted_at: toClickHouseDateTime(new Date()),
        })
      }
    }

    if (insertedData.length === 0) {
      return
    }

    await saveToClickhouse(insertedData)
  }

  async onSeen(payloads: MessageSeenPayload[]) {
    const grouped = groupBy(payloads, (p) => p.context.workspaceId)

    for (const [workspaceId, chatbotPayloads] of Object.entries(grouped)) {
      const contactIds = [
        ...new Set(chatbotPayloads.map((p) => p.context.contactId)),
      ]
      const mappedChatbotPayloads = new Map(
        chatbotPayloads.map((p) => [p.context.contactId, p]),
      )

      const unreadBroadcasts =
        await db.query.contactsOnBroadcastsModel.findMany({
          where: {
            contactId: { in: contactIds },
            isRead: false,
          },
          with: {
            broadcast: {
              columns: { id: true, workspaceId: true },
            },
          },
          columns: {
            broadcastId: true,
            contactId: true,
            contactInboxId: true,
          },
        })

      const filteredBroadcasts = unreadBroadcasts.filter(
        (b) => b.broadcast.workspaceId === workspaceId,
      )

      if (filteredBroadcasts.length === 0) {
        continue
      }

      const updateItems: BroadcastUpdateItem[] = filteredBroadcasts
        .map((b) => {
          const payload = mappedChatbotPayloads.get(b.contactId)
          if (!payload) {
            return null
          }
          return {
            workspaceId,
            broadcastId: b.broadcastId,
            contactId: b.contactId,
            contactInboxId: b.contactInboxId,
            occurredAt: getTime(new Date(payload.occurredAt)),
          }
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)

      await processBroadcastEvents(updateItems, "readAt")
    }
  }

  async onClicked(payloads: FlowClickedPayload[]) {
    const broadcastClicks = payloads.filter((p) => p.action.broadcastId)

    if (broadcastClicks.length === 0) {
      return
    }

    const insertedData: BroadcastStatsType[] = broadcastClicks.map(
      (payload) => ({
        event_id: createId(),
        workspace_id: payload.context.workspaceId,
        broadcast_id: payload.action.broadcastId as string,
        contact_inbox_id: payload.context.contactInboxId ?? "",
        contact_id: payload.context.contactId,
        conv_id: payload.context.conversationId,
        source_id: "",
        channel: payload.context.channel ?? "",
        event_type: FlowEventType["flow:clicked"],
        content: JSON.stringify({
          buttonId: payload.action.buttonId,
          clickType: payload.action.clickType,
        }),
        occurred_at: toClickHouseDateTime(new Date(payload.occurredAt)),
        inserted_at: toClickHouseDateTime(new Date()),
      }),
    )

    await saveToClickhouse(insertedData)
  }
}

export const broadcastAnalyticsService = new BroadcastAnalyticsService()
