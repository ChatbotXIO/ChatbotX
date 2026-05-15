import { db, sql } from "@chatbotx.io/database/client"
import { channelTypes } from "@chatbotx.io/database/partials"
import {
  BROADCAST_PAYLOAD_TYPE,
  type BroadcastMetadataPayload,
  type FlowClickedPayload,
  type MessageDeliveredPayload,
  type MessageFailedPayload,
  type MessageSeenPayload,
  type MessageSentPayload,
} from "@chatbotx.io/flow-config"
import { broadcastStatsRepository } from "../repositories/postgres"
import type {
  BroadcastBulkUpdateItem,
  BroadcastEventType,
  BroadcastFailedBulkUpdateItem,
  BroadcastStats,
  BroadcastUpdateItem,
} from "../schemas/broadcast-stats"
import type { ContactEventData } from "../schemas/common"

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
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)

  if (updateItems.length === 0) {
    return
  }

  const cases = updateItems.map(
    (item) =>
      sql`WHEN "broadcastId" = ${item.broadcastId} AND "contactInboxId" = ${item.contactInboxId} THEN ${item.timestamp}`,
  )

  const tuples = updateItems.map(
    (i) => sql`(${i.broadcastId}, ${i.contactInboxId})`,
  )

  await db.execute(sql`
    UPDATE "ContactOnBroadcast"
    SET ${sql.identifier(updateField)} = CASE ${sql.join(cases, sql` `)} ELSE ${sql.identifier(updateField)} END
    WHERE ("broadcastId", "contactInboxId") IN (${sql.join(tuples, sql`, `)})
  `)
}

export class BroadcastAnalyticsService {
  getStats(input: {
    workspaceId: string
    broadcastId: string
  }): Promise<BroadcastStats> {
    return broadcastStatsRepository.getStats(input)
  }

  getBatchStats(input: {
    workspaceId: string
    broadcastIds: string[]
  }): Promise<Record<string, BroadcastStats>> {
    return broadcastStatsRepository.getBatchStats(input)
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

    const updateItems: BroadcastUpdateItem[] = broadcastPayloads.map((p) => {
      const metadata = p.metadata as BroadcastMetadataPayload
      return {
        workspaceId: p.context.workspaceId,
        broadcastId: metadata.broadcastId,
        contactId: p.context.contactId,
        contactInboxId: metadata.contactInboxId,
        occurredAt: new Date(p.occurredAt),
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

    const updateItems: BroadcastFailedBulkUpdateItem[] = broadcastPayloads.map(
      (p) => ({
        broadcastId: (p.metadata as BroadcastMetadataPayload).broadcastId,
        contactId: p.context.contactId,
        contactInboxId: (p.metadata as BroadcastMetadataPayload).contactInboxId,
        occurredAt: new Date(p.occurredAt),
        errorContent: JSON.stringify(p.errorData),
      }),
    )

    await broadcastStatsRepository.updateFailedBulk(updateItems)
  }

  async onDelivered(payloads: MessageDeliveredPayload[]) {
    const broadcastPayloads = payloads.filter(
      (p) => p.metadata?.type === BROADCAST_PAYLOAD_TYPE,
    )
    if (broadcastPayloads.length === 0) {
      return
    }

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
    const grouped = new Map<string, MessageSeenPayload[]>()
    for (const p of payloads) {
      const ws = p.context.workspaceId
      if (!grouped.has(ws)) {
        grouped.set(ws, [])
      }
      grouped.get(ws)?.push(p)
    }

    for (const [workspaceId, wsPayloads] of grouped) {
      const contactInboxIds = [
        ...new Set(
          wsPayloads
            .map((p) => p.context.contactInboxId)
            .filter(Boolean) as string[],
        ),
      ]
      const payloadMap = new Map(
        wsPayloads.map((p) => [p.context.contactInboxId, p]),
      )

      const unreadBroadcasts =
        await db.query.contactsOnBroadcastsModel.findMany({
          where: {
            contactInboxId: { in: contactInboxIds },
            isRead: false,
          },
          with: {
            broadcast: { columns: { id: true, workspaceId: true } },
          },
          columns: { broadcastId: true, contactId: true, contactInboxId: true },
        })

      const filtered = unreadBroadcasts.filter(
        (b) => b.broadcast.workspaceId === workspaceId,
      )

      if (filtered.length === 0) {
        continue
      }

      const updateItems: BroadcastUpdateItem[] = filtered
        .map((b) => {
          const payload = payloadMap.get(b.contactInboxId)
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
    }
  }

  async onClicked(payloads: FlowClickedPayload[]) {
    const broadcastClicks = payloads.filter((p) => p.action.broadcastId)
    if (broadcastClicks.length === 0) {
      return
    }

    const updateItems: BroadcastBulkUpdateItem[] = broadcastClicks.map((p) => ({
      broadcastId: p.action.broadcastId as string,
      contactInboxId: p.context.contactInboxId ?? "",
      occurredAt: p.occurredAt,
    }))

    await broadcastStatsRepository.updateClickedBulk(updateItems)
  }
}

export const broadcastAnalyticsService = new BroadcastAnalyticsService()
