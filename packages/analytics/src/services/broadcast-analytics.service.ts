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
  updateField: "deliveredAt" | "seenAt",
): Promise<void> {
  if (items.length === 0) {
    return
  }

  const broadcastIds = [...new Set(items.map((i) => i.broadcastId))]
  const contactInboxIds = [...new Set(items.map((i) => i.contactInboxId))]

  const unreadBroadcasts = await db.query.contactsOnBroadcastsModel.findMany({
    where: {
      broadcastId: { in: broadcastIds },
      contactInboxId: { in: contactInboxIds },
      isRead: false,
    },
    columns: {
      broadcastId: true,
      contactInboxId: true,
    },
  })

  if (unreadBroadcasts.length === 0) {
    return
  }

  const updateItems = unreadBroadcasts
    .map((b) => {
      const item = items.find(
        (i) =>
          i.broadcastId === b.broadcastId &&
          i.contactInboxId === b.contactInboxId,
      )
      if (!item) {
        return null
      }
      return {
        broadcastId: b.broadcastId,
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
          `WHEN "broadcastId" = '${item.broadcastId}' AND "contactInboxId" = '${item.contactInboxId}' THEN '${item.timestamp}'`,
      )
      .join(" ")

    const tuples = updateItems.map(
      (i) => sql`(${i.broadcastId}, ${i.contactInboxId})`,
    )

    await db.execute(sql`
      UPDATE "ContactOnBroadcast"
      SET "${sql.raw(updateField)}" = CASE ${sql.raw(cases)} ELSE "${sql.raw(updateField)}" END
      WHERE ("broadcastId", "contactInboxId") IN (${sql.join(tuples, sql`, `)})
    `)
  }
}

export class BroadcastAnalyticsService {
  getStats(input: {
    workspaceId: string
    broadcastId: string
  }): Promise<BroadcastStats> {
    return broadcastStatsRepository.getStats(input)
  }

  getContacts(input: {
    workspaceId: string
    broadcastId: string
    eventType: BroadcastEventType
    page: number
    perPage: number
  }): Promise<{
    contactInboxIds: string[]
    contactEventMap: Map<string, ContactEventData>
  }> {
    return broadcastStatsRepository.getContacts(input)
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
          workspace_id: payload.context.workspaceId,
          broadcast_id: metadata.broadcastId,
          contact_inbox_id: metadata.contactInboxId,
          event_type: MessageEventType["message:delivered"],
          batch_id: 1,
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
        occurredAt: p.occurredAt,
      }
    })

    await processBroadcastEvents(updateItems, "deliveredAt")
  }

  async onFailed(payloads: MessageFailedPayload[]) {
    const broadcastPayloads = payloads.filter(
      (p) => p.metadata?.type === BROADCAST_PAYLOAD_TYPE,
    )

    if (broadcastPayloads.length === 0) {
      return
    }

    const insertedData: BroadcastStatsType[] = broadcastPayloads.map(
      (payload) => ({
        workspace_id: payload.context.workspaceId,
        broadcast_id: (payload.metadata as BroadcastMetadataPayload)
          .broadcastId,
        contact_inbox_id: (payload.metadata as BroadcastMetadataPayload)
          .contactInboxId,
        event_type: MessageEventType["message:failed"],
        batch_id: 1,
        occurred_at: toClickHouseDateTime(new Date(payload.occurredAt)),
        inserted_at: toClickHouseDateTime(new Date()),
      }),
    )

    await saveToClickhouse(insertedData)

    const updateItems = broadcastPayloads.map((p) => ({
      broadcastId: (p.metadata as BroadcastMetadataPayload).broadcastId,
      contactId: p.context.contactId,
      contactInboxId: (p.metadata as BroadcastMetadataPayload).contactInboxId,
      occurredAt: p.occurredAt,
      errorContent: JSON.stringify(p.errorData),
    }))
    await broadcastStatsRepository.updateFailedBulk(updateItems)
  }

  async onDelivered(payloads: MessageDeliveredPayload[]) {
    const broadcastPayloads = payloads.filter(
      (p) => p.metadata?.type === BROADCAST_PAYLOAD_TYPE,
    )

    if (broadcastPayloads.length === 0) {
      return
    }

    const insertedData: BroadcastStatsType[] = broadcastPayloads.map(
      (payload) => {
        const metadata = payload.metadata as BroadcastMetadataPayload
        return {
          workspace_id: payload.context.workspaceId,
          broadcast_id: metadata.broadcastId,
          contact_inbox_id: metadata.contactInboxId,
          event_type: MessageEventType["message:delivered"],
          batch_id: 1,
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
        occurredAt: p.occurredAt,
      }
    })

    await processBroadcastEvents(updateItems, "deliveredAt")
  }

  async onSeen(payloads: MessageSeenPayload[]) {
    const grouped = groupBy(payloads, (p) => p.context.workspaceId)

    for (const [workspaceId, chatbotPayloads] of Object.entries(grouped)) {
      const contactInboxIds = [
        ...new Set(
          chatbotPayloads
            .map((p) => p.context.contactInboxId)
            .filter(Boolean) as string[],
        ),
      ]
      const mappedChatbotPayloads = new Map(
        chatbotPayloads.map((p) => [p.context.contactInboxId, p]),
      )

      const unreadBroadcasts =
        await db.query.contactsOnBroadcastsModel.findMany({
          where: {
            contactInboxId: { in: contactInboxIds },
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
          const payload = mappedChatbotPayloads.get(b.contactInboxId)
          if (!payload) {
            return null
          }
          return {
            workspaceId,
            broadcastId: b.broadcastId,
            contactId: b.contactId,
            contactInboxId: b.contactInboxId,
            occurredAt: payload.occurredAt,
          }
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)

      await processBroadcastEvents(updateItems, "seenAt")

      const insertedData: BroadcastStatsType[] = filteredBroadcasts.map(
        (br) => {
          const occurredAt = toClickHouseDateTime(
            new Date(
              mappedChatbotPayloads.get(br.contactInboxId)?.occurredAt ||
                new Date(),
            ),
          )

          return {
            workspace_id: br.broadcast.workspaceId,
            broadcast_id: br.broadcastId,
            contact_inbox_id: br.contactInboxId,
            event_type: MessageEventType["message:seen"],
            batch_id: 1,
            occurred_at: occurredAt,
            inserted_at: toClickHouseDateTime(new Date()),
          }
        },
      )

      await broadcastStatsRepository.insertClickhouseNodeStats(insertedData)
    }
  }

  async onClicked(payloads: FlowClickedPayload[]) {
    const broadcastClicks = payloads.filter((p) => p.action.broadcastId)

    if (broadcastClicks.length === 0) {
      return
    }

    const insertedData: BroadcastStatsType[] = broadcastClicks.map(
      (payload) => ({
        workspace_id: payload.context.workspaceId,
        broadcast_id: payload.action.broadcastId as string,
        contact_inbox_id: payload.context.contactInboxId ?? "",
        event_type: FlowEventType["flow:clicked"],
        batch_id: 1,
        occurred_at: toClickHouseDateTime(new Date(payload.occurredAt)),
        inserted_at: toClickHouseDateTime(new Date()),
      }),
    )

    await saveToClickhouse(insertedData)

    const updateItems = broadcastClicks.map((p) => ({
      broadcastId: p.action.broadcastId as string,
      contactInboxId: p.context.contactInboxId ?? "",
      occurredAt: p.occurredAt,
    }))
    await broadcastStatsRepository.updateClickedBulk(updateItems)
  }
}

export const broadcastAnalyticsService = new BroadcastAnalyticsService()
