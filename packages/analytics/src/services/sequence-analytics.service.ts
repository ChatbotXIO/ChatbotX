import { clickhouse } from "@chatbotx.io/clickhouse/client"
import type { SequenceScheduleEventType } from "@chatbotx.io/clickhouse/schemas"
import { toClickHouseDateTime } from "@chatbotx.io/clickhouse/utils"
import { db, sql } from "@chatbotx.io/database/client"
import { channelTypes } from "@chatbotx.io/database/partials"
import {
  FlowEventType,
  type MessageDeliveredPayload,
  MessageEventType,
  type MessageFailedPayload,
  type MessageSeenPayload,
  type MessageSentPayload,
  SEQUENCE_SCHEDULE_PAYLOAD_TYPE,
} from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { sequenceStatsRepository } from "../repositories/sequence-stats.repository"
import type { ContactEventData } from "../schemas/common"
import type {
  SequenceSchemaPayload,
  SequenceStepEventType,
  SequenceStepStats,
} from "../schemas/sequence-stats"

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

async function saveToClickhouse(data: SequenceScheduleEventType[]) {
  if (data.length === 0) {
    return
  }

  try {
    await clickhouse.insert({
      table: "sequence_schedule_events",
      values: data,
      format: "JSONEachRow",
    })
  } catch (error) {
    console.error("Failed to save sequence stats to ClickHouse:", error)
  }
}

export class SequenceAnalyticsService {
  getStepStats(input: {
    workspaceId: string
    sequenceId: string
    stepId: string
  }): Promise<SequenceStepStats> {
    return sequenceStatsRepository.getStepStats(input)
  }

  getContactsFromClickHouse(input: {
    workspaceId: string
    sequenceId: string
    stepId: string
    eventType: SequenceStepEventType
    page: number
    perPage: number
  }): Promise<{
    contactInboxIds: string[]
    contactEventMap: Map<string, ContactEventData>
  }> {
    return sequenceStatsRepository.getContactsFromClickHouse(input)
  }

  async onMessageSent(payloads: MessageSentPayload[]) {
    const sequenceSchedulePayloads = payloads.filter(
      (p) =>
        p.metadata?.type === SEQUENCE_SCHEDULE_PAYLOAD_TYPE &&
        p.context.channel !== channelTypes.enum.whatsapp,
    )

    const insertedData: SequenceScheduleEventType[] = []

    for (const payload of sequenceSchedulePayloads) {
      if (
        payload.metadata?.type === SEQUENCE_SCHEDULE_PAYLOAD_TYPE &&
        payload.context.channel !== channelTypes.enum.whatsapp
      ) {
        insertedData.push({
          event_id: createId(),
          workspace_id: payload.context.workspaceId,
          contact_inbox_id: payload.metadata.contactInboxId,
          contact_id: payload.context.contactId,
          conv_id: payload.context.conversationId,
          source_id: payload.action.sourceId ?? "",
          channel: payload.context.channel ?? "",
          event_type: MessageEventType["message:delivered"],
          sequence_id: payload.metadata.sequenceId,
          step_id: payload.metadata.sequenceStepId,
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

    const sequenceContacts = sequenceSchedulePayloads.map((p) => ({
      sequenceId: (
        p.metadata as {
          type: typeof SEQUENCE_SCHEDULE_PAYLOAD_TYPE
          sequenceId: string
        }
      ).sequenceId,
      contactId: p.context.contactId,
    }))

    if (sequenceContacts.length > 0) {
      const tuples = sequenceContacts.map(
        (sc) => sql`(${sc.sequenceId}, ${sc.contactId})`,
      )

      await db.execute(sql`
        UPDATE "ContactOnSequence"
        SET "status" = 'sent'
        WHERE ("sequenceId", "contactId") IN (${sql.join(tuples, sql`, `)})
      `)
    }
  }

  async onFailed(payloads: MessageFailedPayload[]) {
    const sequenceSchedulePayloads = payloads.filter(
      (p) => p.metadata?.type === SEQUENCE_SCHEDULE_PAYLOAD_TYPE,
    )

    const insertedData: SequenceScheduleEventType[] = []

    for (const payload of sequenceSchedulePayloads) {
      if (payload.metadata?.type === SEQUENCE_SCHEDULE_PAYLOAD_TYPE) {
        insertedData.push({
          event_id: createId(),
          workspace_id: payload.context.workspaceId,
          sequence_id: payload.metadata.sequenceId,
          step_id: payload.metadata.sequenceStepId,
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
    const sequenceSchedulePayloads = payloads.filter(
      (p) => p.metadata?.type === SEQUENCE_SCHEDULE_PAYLOAD_TYPE,
    )

    const insertedData: SequenceScheduleEventType[] = []

    for (const payload of sequenceSchedulePayloads) {
      if (payload.metadata?.type === SEQUENCE_SCHEDULE_PAYLOAD_TYPE) {
        insertedData.push({
          event_id: createId(),
          workspace_id: payload.context.workspaceId,
          sequence_id: payload.metadata.sequenceId,
          step_id: payload.metadata.sequenceStepId,
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
      const mapContactInboxes = new Map(
        chatbotPayloads.map((p) => [p.context.contactInboxId, p]),
      )

      const sequenceDispatches = await db.query.sequenceDispatchModel.findMany({
        where: {
          contactId: { in: contactIds },
          status: { in: ["completed"] },
        },
        with: {
          sequence: {
            columns: { id: true, workspaceId: true },
          },
        },
      })

      const filtered = sequenceDispatches.filter((s) => {
        if (s.sequence.workspaceId !== workspaceId) {
          return false
        }

        const payload = mapContactInboxes.get(s.contactInboxId)
        if (
          payload?.occurredAt &&
          s.completedAt &&
          payload.occurredAt <= s.completedAt
        ) {
          return true
        }

        return false
      })

      if (filtered.length === 0) {
        continue
      }

      const contactInboxMap = new Map(
        chatbotPayloads
          .filter((p) => p.context.contactInboxId)
          .map((p) => [
            p.context.contactId,
            p.context.contactInboxId as string,
          ]),
      )

      const insertedData: SequenceScheduleEventType[] = filtered.map((s) => {
        const payload = mapContactInboxes.get(s.contactInboxId)

        return {
          event_id: createId(),
          workspace_id: workspaceId,
          sequence_id: s.sequenceId,
          step_id: s.stepId,
          contact_id: s.contactId,
          contact_inbox_id: contactInboxMap.get(s.contactId) ?? "",
          conv_id: "",
          source_id: "",
          channel: "",
          event_type: MessageEventType["message:seen"],
          content: JSON.stringify({}),
          occurred_at: toClickHouseDateTime(
            new Date(payload ? payload.occurredAt : new Date()),
          ),
          inserted_at: toClickHouseDateTime(new Date()),
        }
      })

      if (insertedData.length) {
        await saveToClickhouse(insertedData)
      }
    }
  }

  async onClicked(payloads: SequenceSchemaPayload[]) {
    try {
      const sequenceClicks = payloads.filter((p) => p.metadata?.sequenceStepId)

      const sequenceStepIds = new Set<string>(
        sequenceClicks.map((p) => p.metadata.sequenceStepId),
      )

      const sequenceSteps = await db.query.sequenceStepModel.findMany({
        where: {
          id: {
            in: Array.from(sequenceStepIds),
          },
        },
        columns: {
          id: true,
          sequenceId: true,
        },
      })
      const sequenceStepsMap = new Map<string, string>(
        sequenceSteps.map((s) => [s.id, s.sequenceId]),
      )

      if (sequenceClicks.length === 0) {
        return
      }

      const insertedData: SequenceScheduleEventType[] = sequenceClicks.map(
        (payload) => ({
          event_id: createId(),
          workspace_id: payload.context.workspaceId,
          sequence_id:
            sequenceStepsMap.get(payload.metadata.sequenceStepId) || "",
          step_id: payload.metadata.sequenceStepId || "",
          contact_id: payload.context.contactId,
          contact_inbox_id: payload.context.contactInboxId ?? "",
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

      await clickhouse.insert({
        table: "sequence_schedule_events",
        values: insertedData,
        format: "JSONEachRow",
      })
    } catch (error) {
      console.error("Failed to save clicked events", error)
    }
  }
}

export const sequenceAnalyticsService = new SequenceAnalyticsService()
