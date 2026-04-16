import { clickhouse } from "@chatbotx.io/clickhouse/client"
import type { BroadcastStatsType } from "@chatbotx.io/clickhouse/schemas"
import type {
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

  onSeen(payloads: MessageSeenPayload[]) {
    // TODO: implement
    console.log("onSeen", payloads)
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
