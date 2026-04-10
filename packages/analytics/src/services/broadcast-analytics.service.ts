import { clickhouse } from "@chatbotx.io/clickhouse/client"
import type { BroadcastStatsType } from "@chatbotx.io/clickhouse/schemas"
import { and, db, eq } from "@chatbotx.io/database/client"
import { contactsOnBroadcastsModel } from "@chatbotx.io/database/schema"
import {
  type FlowClickedPayload,
  FlowEventType,
  type MessageDeliveredPayload,
  MessageEventType,
  type MessageFailedPayload,
  type MessageSeenPayload,
  type MessageSentPayload,
} from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { format, getTime } from "date-fns"
import { broadcastStatsRepository } from "../repositories/broadcast-stats.repository"
import type {
  BroadcastEventType,
  BroadcastStats,
} from "../schemas/broadcast-stats"
import type { ContactEventData } from "../schemas/common"

function toClickHouseDateTime(date: Date): string {
  const utcDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return format(utcDate, "yyyy-MM-dd HH:mm:ss")
}

function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce(
    (acc, item) => {
      const k = String(item[key])
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
    contactIds: string[]
    contactEventMap: Map<string, ContactEventData>
  }> {
    return broadcastStatsRepository.getContactsFromClickHouse(input)
  }

  async onMessageSent(payloads: MessageSentPayload[]) {
    const insertedData: BroadcastStatsType[] = []

    for (const payload of payloads) {
      if (
        payload.metadata?.type === "broadcast" &&
        payload.channel !== "whatsapp"
      ) {
        insertedData.push({
          event_id: createId(),
          workspace_id: payload.workspaceId,
          broadcast_id: payload.metadata.broadcastId,
          contact_inbox_id: payload.metadata.contactInboxId,
          contact_id: payload.contactId,
          conv_id: payload.conversationId,
          source_id: payload.sourceId ?? "",
          channel: payload.channel ?? "",
          event_type: MessageEventType["message:sent"],
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

    const broadcastContacts = payloads
      .filter((p) => p.metadata?.type === "broadcast")
      .map((p) => ({
        broadcastId: (p.metadata as { type: "broadcast"; broadcastId: string })
          .broadcastId,
        contactId: p.contactId,
        occurredAt: p.occurredAt,
      }))

    if (broadcastContacts.length > 0) {
      for (const bc of broadcastContacts) {
        await db
          .update(contactsOnBroadcastsModel)
          .set({
            sent: true,
            sentAt: getTime(new Date(bc.occurredAt)).toString(),
          })
          .where(
            and(
              eq(contactsOnBroadcastsModel.broadcastId, bc.broadcastId),
              eq(contactsOnBroadcastsModel.contactId, bc.contactId),
            ),
          )
      }
    }

    // check readat again
  }

  async onFailed(payloads: MessageFailedPayload[]) {
    const insertedData: BroadcastStatsType[] = []

    for (const payload of payloads) {
      if (payload.metadata?.type === "broadcast") {
        insertedData.push({
          event_id: createId(),
          workspace_id: payload.workspaceId,
          broadcast_id: payload.metadata.broadcastId,
          contact_inbox_id: payload.metadata.contactInboxId,
          contact_id: payload.contactId,
          conv_id: payload.conversationId,
          source_id: payload.sourceId ?? "",
          channel: payload.channel ?? "",
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
      if (payload.metadata?.type === "broadcast") {
        insertedData.push({
          event_id: createId(),
          workspace_id: payload.workspaceId,
          broadcast_id: payload.metadata.broadcastId,
          contact_inbox_id: payload.metadata.contactInboxId,
          contact_id: payload.contactId,
          conv_id: payload.conversationId,
          source_id: payload.sourceId ?? "",
          channel: payload.channel ?? "",
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
    const grouped = groupBy(payloads, "workspaceId")

    for (const [workspaceId, chatbotPayloads] of Object.entries(grouped)) {
      const contactInboxIds = [
        ...new Set(chatbotPayloads.map((p) => p.contactInboxId)),
      ]
      const mappedChatbotPayloads = new Map(
        chatbotPayloads.map((p) => [p.contactId, p]),
      )
      const seenAt = new Date()

      const contactInboxes = await db.query.contactInboxModel.findMany({
        where: {
          id: { in: contactInboxIds as string[] },
        },
        columns: {
          id: true,
          contactId: true,
          inboxId: true,
          channel: true,
        },
        with: {
          contact: {
            columns: {
              id: true,
              lastReadAt: true,
            },
          },
          conversation: {
            columns: {
              id: true,
              contactLastReadAt: true,
            },
          },
        },
      })

      const contactToContactInboxMap = new Map(
        contactInboxes.map((ci) => [ci.contactId, ci]),
      )

      const sentBroadcasts = await db.query.contactsOnBroadcastsModel.findMany({
        where: {
          contactId: { in: contactInboxes.map((ci) => ci.contactId) },
          isRead: false,
        },
        with: {
          broadcast: {
            columns: { id: true, workspaceId: true, schedulesAt: true },
          },
        },
        columns: {
          broadcastId: true,
          contactId: true,
        },
      })

      if (sentBroadcasts.length === 0) {
        continue
      }

      const sendBroadcastIds = sentBroadcasts.map((bc) => [
        bc.broadcastId,
        bc.contactId,
      ])

      if (sentBroadcasts.length > 0) {
        for (const bc of sentBroadcasts) {
          const chatbotPayload = mappedChatbotPayloads.get(bc.contactId)
          if (!chatbotPayload) {
            continue
          }

          await db
            .update(contactsOnBroadcastsModel)
            .set({
              sentAt: getTime(new Date(chatbotPayload.occurredAt)).toString(),
            })
            .where(
              and(
                eq(contactsOnBroadcastsModel.broadcastId, bc.broadcastId),
                eq(contactsOnBroadcastsModel.contactId, bc.contactId),
              ),
            )
        }
      }

      const readBroadcasts = await db.query.contactsOnBroadcastsModel.findMany({
        where: {
          broadcastId: { in: sendBroadcastIds.map(([, bid]) => bid) },
          contactId: { in: sendBroadcastIds.map(([_, cid]) => cid) },
          isRead: true,
        },
      })

      const insertedData: BroadcastStatsType[] = readBroadcasts.map((b) => ({
        event_id: createId(),
        workspace_id: workspaceId,
        broadcast_id: b.broadcastId,
        contact_inbox_id: contactToContactInboxMap.get(b.contactId)?.id ?? "",
        contact_id: b.contactId,
        conv_id: "",
        source_id: "",
        channel: "",
        event_type: MessageEventType["message:seen"],
        content: JSON.stringify({}),
        occurred_at: toClickHouseDateTime(seenAt),
        inserted_at: toClickHouseDateTime(new Date()),
      }))

      await saveToClickhouse(insertedData)
    }
  }

  async onClicked(payloads: FlowClickedPayload[]) {
    const broadcastClicks = payloads.filter((p) => p.broadcastId)

    if (broadcastClicks.length === 0) {
      return
    }

    const insertedData: BroadcastStatsType[] = broadcastClicks.map(
      (payload) => ({
        event_id: createId(),
        workspace_id: payload.workspaceId,
        broadcast_id: payload.broadcastId as string,
        contact_inbox_id: payload.contactInboxId ?? "",
        contact_id: payload.contactId,
        conv_id: payload.conversationId,
        source_id: "",
        channel: payload.channel ?? "",
        event_type: FlowEventType["flow:clicked"],
        content: JSON.stringify({
          buttonId: payload.buttonId,
          clickType: payload.clickType,
        }),
        occurred_at: toClickHouseDateTime(new Date(payload.occurredAt)),
        inserted_at: toClickHouseDateTime(new Date()),
      }),
    )

    await saveToClickhouse(insertedData)
  }
}

export const broadcastAnalyticsService = new BroadcastAnalyticsService()
