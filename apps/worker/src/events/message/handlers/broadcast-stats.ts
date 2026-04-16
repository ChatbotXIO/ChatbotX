import { and, db, eq, inArray } from "@aha.chat/database/client"
import {
  contactModel,
  contactsOnBroadcastsModel,
} from "@aha.chat/database/schema"
import { clickhouse } from "@chatbotx.io/clickhouse/client"
import type { BroadcastStatsType } from "@chatbotx.io/clickhouse/schemas"
import type {
  FlowClickedPayload,
  MessageDeliveredPayload,
  MessageFailedPayload,
  MessageSeenPayload,
  MessageSentPayload,
} from "@chatbotx.io/event-bus"
import { createId } from "@chatbotx.io/utils"
import { format } from "date-fns"

function toClickHouseDateTime(date: Date): string {
  const utcDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return format(utcDate, "yyyy-MM-dd HH:mm:ss")
}

export const broadcastStathandler = {
  async onMessageSent(payloads: MessageSentPayload[]) {
    const insertedData: BroadcastStatsType[] = []

    for (const payload of payloads) {
      if (payload.metadata?.type === "broadcast") {
        insertedData.push({
          event_id: createId(),
          chatbot_id: payload.chatbotId,
          broadcast_id: payload.metadata.broadcastId,
          contact_id: payload.contactId,
          conv_id: payload.conversationId,
          event_type: "sent",
          content: JSON.stringify({}),
          occurred_at: toClickHouseDateTime(new Date(payload.occurredAt)),
          inserted_at: toClickHouseDateTime(new Date()),
        })

        if (payload.channel !== "whatsapp") {
          insertedData.push({
            event_id: createId(),
            chatbot_id: payload.chatbotId,
            broadcast_id: payload.metadata.broadcastId,
            contact_id: payload.contactId,
            conv_id: payload.conversationId,
            event_type: "delivered",
            content: JSON.stringify({}),
            occurred_at: toClickHouseDateTime(new Date(payload.occurredAt)),
            inserted_at: toClickHouseDateTime(new Date()),
          })
        }
      }
    }

    if (insertedData.length === 0) {
      return
    }

    await this.saveToClickhouse(insertedData)

    const broadcastContacts = payloads
      .filter((p) => p.metadata?.type === "broadcast")
      .map((p) => ({
        broadcastId: (p.metadata as { type: "broadcast"; broadcastId: string })
          .broadcastId,
        contactId: p.contactId,
      }))

    if (broadcastContacts.length > 0) {
      for (const bc of broadcastContacts) {
        await db
          .update(contactsOnBroadcastsModel)
          .set({ sent: true })
          .where(
            and(
              eq(contactsOnBroadcastsModel.broadcastId, bc.broadcastId),
              eq(contactsOnBroadcastsModel.contactId, bc.contactId),
            ),
          )
      }
    }
  },

  async onFailed(payloads: MessageFailedPayload[]) {
    const insertedData: BroadcastStatsType[] = []

    for (const payload of payloads) {
      if (payload.metadata?.type === "broadcast") {
        insertedData.push({
          event_id: createId(),
          chatbot_id: payload.chatbotId,
          broadcast_id: payload.metadata.broadcastId,
          contact_id: payload.contactId,
          conv_id: payload.conversationId,
          event_type: "failed",
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

    await this.saveToClickhouse(insertedData)
  },

  async onDelivered(payloads: MessageDeliveredPayload[]) {
    const insertedData: BroadcastStatsType[] = []

    for (const payload of payloads) {
      if (payload.metadata?.type === "broadcast") {
        insertedData.push({
          event_id: createId(),
          chatbot_id: payload.chatbotId,
          broadcast_id: payload.metadata.broadcastId,
          contact_id: payload.contactId,
          conv_id: payload.conversationId,
          event_type: "delivered",
          content: JSON.stringify({}),
          occurred_at: toClickHouseDateTime(new Date(payload.occurredAt)),
          inserted_at: toClickHouseDateTime(new Date()),
        })
      }
    }

    if (insertedData.length === 0) {
      return
    }

    await this.saveToClickhouse(insertedData)
  },

  async onSeen(payloads: MessageSeenPayload[]) {
    const grouped = this.groupBy(payloads, "chatbotId")

    for (const [chatbotId, chatbotPayloads] of Object.entries(grouped)) {
      const contactIds = [...new Set(chatbotPayloads.map((p) => p.contactId))]
      const seenAt = new Date()

      const contacts = await db
        .select({ id: contactModel.id, lastReadAt: contactModel.lastReadAt })
        .from(contactModel)
        .where(inArray(contactModel.id, contactIds))

      const sentBroadcasts = await db.query.contactsOnBroadcastsModel.findMany({
        where: {
          contactId: { in: contactIds },
          sent: true,
        },
        with: {
          broadcast: {
            columns: { id: true, chatbotId: true, schedulesAt: true },
          },
        },
      })

      const contactLastReadMap = new Map(
        contacts.map((c) => [c.id, c.lastReadAt]),
      )
      const filtered = sentBroadcasts.filter((b) => {
        if (b.broadcast.chatbotId !== chatbotId) {
          return false
        }
        const lastReadAt = contactLastReadMap.get(b.contactId)
        return (
          !lastReadAt ||
          (b.broadcast.schedulesAt && b.broadcast.schedulesAt > lastReadAt)
        )
      })

      await db
        .update(contactModel)
        .set({ lastReadAt: seenAt })
        .where(inArray(contactModel.id, contactIds))

      if (filtered.length === 0) {
        continue
      }

      const insertedData: BroadcastStatsType[] = filtered.map((b) => ({
        event_id: createId(),
        chatbot_id: chatbotId,
        broadcast_id: b.broadcastId,
        contact_id: b.contactId,
        conv_id: "",
        event_type: "seen",
        content: JSON.stringify({}),
        occurred_at: toClickHouseDateTime(seenAt),
        inserted_at: toClickHouseDateTime(new Date()),
      }))

      await this.saveToClickhouse(insertedData)
    }
  },

  async onClicked(payloads: FlowClickedPayload[]) {
    try {
      const broadcastClicks = payloads.filter((p) => p.broadcastId)

      console.log({ broadcastClicks })
      if (broadcastClicks.length === 0) {
        return
      }

      const insertedData: BroadcastStatsType[] = broadcastClicks.map(
        (payload) => ({
          event_id: createId(),
          chatbot_id: payload.chatbotId,
          broadcast_id: payload.broadcastId as string,
          contact_id: payload.contactId,
          conv_id: payload.conversationId,
          event_type: "clicked",
          content: JSON.stringify({
            buttonId: payload.buttonId,
            clickType: payload.clickType,
          }),
          occurred_at: toClickHouseDateTime(new Date(payload.occurredAt)),
          inserted_at: toClickHouseDateTime(new Date()),
        }),
      )

      await clickhouse.insert({
        table: "broadcast_events",
        values: insertedData,
        format: "JSONEachRow",
      })
    } catch (error) {
      console.error("Failed to save clicked events", error)
    }
  },

  groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
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
  },

  async saveToClickhouse(data: BroadcastStatsType[]) {
    if (data.length === 0) {
      return
    }

    try {
      const _result = await clickhouse.insert({
        table: "broadcast_events",
        values: data,
        format: "JSONEachRow",
      })

      // console.log({ _result })
    } catch (error) {
      console.error("Failed to save broadcast stats to ClickHouse:", error)
    }
  },
}
