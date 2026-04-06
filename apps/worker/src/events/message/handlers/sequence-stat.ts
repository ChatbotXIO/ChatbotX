import { clickhouse } from "@chatbotx.io/clickhouse/client"
import type { SequenceScheduleEventType } from "@chatbotx.io/clickhouse/schemas"
import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import {
  contactModel,
  contactsOnSequenceModel,
} from "@chatbotx.io/database/schema"
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

export const sequenceStathandler = {
  async onMessageSent(payloads: MessageSentPayload[]) {
    const insertedData: SequenceScheduleEventType[] = []

    for (const payload of payloads) {
      if (
        payload.metadata?.type === "sequenceSchedule" &&
        payload.channel !== "whatsapp"
      ) {
        insertedData.push({
          event_id: createId(),
          workspace_id: payload.workspaceId,
          contact_inbox_id: payload.metadata.contactInboxId,
          contact_id: payload.contactId,
          conv_id: payload.conversationId,
          source_id: payload.sourceId ?? "",
          channel: payload.channel ?? "",
          event_type: "delivered",
          sequence_id: payload.metadata.sequenceId,
          step_id: payload.metadata.stepId,
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

    const sequenceContacts = payloads
      .filter((p) => p.metadata?.type === "sequenceSchedule")
      .map((p) => ({
        sequenceId: (
          p.metadata as { type: "sequenceSchedule"; sequenceId: string }
        ).sequenceId,
        contactId: p.contactId,
      }))

    if (sequenceContacts.length > 0) {
      for (const sc of sequenceContacts) {
        await db
          .update(contactsOnSequenceModel)
          .set({ status: "sent" })
          .where(
            and(
              eq(contactsOnSequenceModel.sequenceId, sc.sequenceId),
              eq(contactsOnSequenceModel.contactId, sc.contactId),
            ),
          )
      }
    }
  },

  async onFailed(payloads: MessageFailedPayload[]) {
    const insertedData: SequenceScheduleEventType[] = []

    for (const payload of payloads) {
      if (payload.metadata?.type === "sequenceSchedule") {
        insertedData.push({
          event_id: createId(),
          workspace_id: payload.workspaceId,
          sequence_id: payload.metadata.sequenceId,
          step_id: payload.metadata.stepId,
          contact_inbox_id: payload.metadata.contactInboxId,
          contact_id: payload.contactId,
          conv_id: payload.conversationId,
          source_id: payload.sourceId ?? "",
          channel: payload.channel ?? "",
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
    const insertedData: SequenceScheduleEventType[] = []

    for (const payload of payloads) {
      if (payload.metadata?.type === "sequenceSchedule") {
        insertedData.push({
          event_id: createId(),
          workspace_id: payload.workspaceId,
          sequence_id: payload.metadata.sequenceId,
          step_id: payload.metadata.stepId,
          contact_inbox_id: payload.metadata.contactInboxId,
          contact_id: payload.contactId,
          conv_id: payload.conversationId,
          source_id: payload.sourceId ?? "",
          channel: payload.channel ?? "",
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
    const grouped = this.groupBy(payloads, "workspaceId")

    for (const [workspaceId, chatbotPayloads] of Object.entries(grouped)) {
      const contactIds = [...new Set(chatbotPayloads.map((p) => p.contactId))]
      const seenAt = new Date()

      const activeSequences = await db.query.contactsOnSequenceModel.findMany({
        where: {
          contactId: { in: contactIds },
          status: { in: ["active", "sent"] },
        },
        with: {
          sequence: {
            columns: { id: true, workspaceId: true },
          },
        },
      })

      const filtered = activeSequences.filter((s) => {
        if (s.sequence.workspaceId !== workspaceId) {
          return false
        }
        return true
      })

      await db
        .update(contactModel)
        .set({ lastReadAt: seenAt })
        .where(inArray(contactModel.id, contactIds))

      if (filtered.length === 0) {
        continue
      }

      const contactInboxMap = new Map(
        chatbotPayloads
          .filter((p) => p.contactInboxId)
          .map((p) => [p.contactId, p.contactInboxId as string]),
      )

      const insertedData: SequenceScheduleEventType[] = filtered.map((s) => ({
        event_id: createId(),
        workspace_id: workspaceId,
        sequence_id: s.sequenceId,
        step_id: s.lastStepId || "",
        contact_id: s.contactId,
        contact_inbox_id: contactInboxMap.get(s.contactId) ?? "",
        conv_id: "",
        source_id: "",
        channel: "",
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
      const sequenceClicks = payloads.filter((p) => p.sequenceId)

      if (sequenceClicks.length === 0) {
        return
      }

      const insertedData: SequenceScheduleEventType[] = sequenceClicks.map(
        (payload) => ({
          event_id: createId(),
          workspace_id: payload.workspaceId,
          sequence_id: payload.sequenceId as string,
          step_id: payload.stepId || "",
          contact_id: payload.contactId,
          contact_inbox_id: payload.contactInboxId ?? "",
          conv_id: payload.conversationId,
          source_id: "",
          channel: payload.channel ?? "",
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
        table: "sequence_schedule_events",
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

  async saveToClickhouse(data: SequenceScheduleEventType[]) {
    if (data.length === 0) {
      return
    }

    try {
      const _result = await clickhouse.insert({
        table: "sequence_schedule_events",
        values: data,
        format: "JSONEachRow",
      })

      // console.log({ _result })
    } catch (error) {
      console.error("Failed to save sequence stats to ClickHouse:", error)
    }
  },
}
