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

type SequenceUpdateItem = {
  workspaceId: string
  sequenceId: string
  stepId: string
  contactInboxId: string
  occurredAt: Date
}

async function processSequenceEvents(
  items: SequenceUpdateItem[],
  updateField: "deliveredAt" | "seenAt" | "clickedAt",
): Promise<void> {
  if (items.length === 0) {
    return
  }

  const sequenceIds = [...new Set(items.map((i) => i.sequenceId))]
  const stepIds = [...new Set(items.map((i) => i.stepId))]
  const contactInboxIds = [...new Set(items.map((i) => i.contactInboxId))]

  const dispatches = await db.query.sequenceDispatchModel.findMany({
    where: {
      sequenceId: { in: sequenceIds },
      stepId: { in: stepIds },
      contactInboxId: { in: contactInboxIds },
    },
    columns: {
      id: true,
      sequenceId: true,
      stepId: true,
      contactInboxId: true,
    },
  })

  if (dispatches.length === 0) {
    return
  }

  const updateItems = dispatches
    .map((d) => {
      const item = items.find(
        (i) =>
          i.sequenceId === d.sequenceId &&
          i.stepId === d.stepId &&
          i.contactInboxId === d.contactInboxId,
      )
      if (!item) {
        return null
      }
      return {
        id: d.id,
        timestamp: item.occurredAt,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)

  if (updateItems.length > 0) {
    const cases = updateItems
      .map(
        (item) =>
          `WHEN "id" = '${item.id}' THEN '${item.timestamp.toISOString()}'`,
      )
      .join(" ")

    const ids = updateItems.map((i) => sql`${i.id}`)

    await db.execute(sql`
      UPDATE "SequenceDispatch"
      SET "${sql.raw(updateField)}" = CASE ${sql.raw(cases)} ELSE "${sql.raw(updateField)}" END
      WHERE "id" IN (${sql.join(ids, sql`, `)})
    `)
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

  getContacts(input: {
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
    return sequenceStatsRepository.getContacts(input)
  }

  async onMessageSent(payloads: MessageSentPayload[]) {
    const sequenceSchedulePayloads = payloads.filter(
      (p) =>
        p.metadata?.type === SEQUENCE_SCHEDULE_PAYLOAD_TYPE &&
        p.context.channel !== channelTypes.enum.whatsapp,
    )

    if (sequenceSchedulePayloads.length === 0) {
      return
    }

    const insertedData: SequenceScheduleEventType[] =
      sequenceSchedulePayloads.map((payload) => ({
        workspace_id: payload.context.workspaceId,
        contact_inbox_id: (payload.metadata as { contactInboxId: string })
          .contactInboxId,
        event_type: MessageEventType["message:delivered"],
        sequence_id: (payload.metadata as { sequenceId: string }).sequenceId,
        step_id: (payload.metadata as { sequenceStepId: string })
          .sequenceStepId,
        occurred_at: toClickHouseDateTime(new Date(payload.occurredAt)),
        inserted_at: toClickHouseDateTime(new Date()),
      }))

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

    const updateItems: SequenceUpdateItem[] = sequenceSchedulePayloads.map(
      (p) => ({
        workspaceId: p.context.workspaceId,
        sequenceId: (p.metadata as { sequenceId: string }).sequenceId,
        stepId: (p.metadata as { sequenceStepId: string }).sequenceStepId,
        contactInboxId: (p.metadata as { contactInboxId: string })
          .contactInboxId,
        occurredAt: new Date(p.occurredAt),
      }),
    )
    await processSequenceEvents(updateItems, "deliveredAt")
  }

  async onFailed(payloads: MessageFailedPayload[]) {
    const sequenceSchedulePayloads = payloads.filter(
      (p) => p.metadata?.type === SEQUENCE_SCHEDULE_PAYLOAD_TYPE,
    )

    if (sequenceSchedulePayloads.length === 0) {
      return
    }

    const insertedData: SequenceScheduleEventType[] =
      sequenceSchedulePayloads.map((payload) => ({
        workspace_id: payload.context.workspaceId,
        sequence_id: (payload.metadata as { sequenceId: string }).sequenceId,
        step_id: (payload.metadata as { sequenceStepId: string })
          .sequenceStepId,
        contact_inbox_id: (payload.metadata as { contactInboxId: string })
          .contactInboxId,
        event_type: MessageEventType["message:failed"],
        occurred_at: toClickHouseDateTime(new Date(payload.occurredAt)),
        inserted_at: toClickHouseDateTime(new Date()),
      }))

    await saveToClickhouse(insertedData)

    const updateItems = sequenceSchedulePayloads.map((p) => ({
      sequenceId: (p.metadata as { sequenceId: string }).sequenceId,
      stepId: (p.metadata as { sequenceStepId: string }).sequenceStepId,
      contactInboxId: (p.metadata as { contactInboxId: string }).contactInboxId,
      occurredAt: new Date(p.occurredAt),
      errorContent: JSON.stringify(p.errorData),
    }))
    await sequenceStatsRepository.updateFailedBulk(updateItems)
  }

  async onDelivered(payloads: MessageDeliveredPayload[]) {
    const sequenceSchedulePayloads = payloads.filter(
      (p) => p.metadata?.type === SEQUENCE_SCHEDULE_PAYLOAD_TYPE,
    )

    if (sequenceSchedulePayloads.length === 0) {
      return
    }

    const insertedData: SequenceScheduleEventType[] =
      sequenceSchedulePayloads.map((payload) => ({
        workspace_id: payload.context.workspaceId,
        sequence_id: (payload.metadata as { sequenceId: string }).sequenceId,
        step_id: (payload.metadata as { sequenceStepId: string })
          .sequenceStepId,
        contact_inbox_id: (payload.metadata as { contactInboxId: string })
          .contactInboxId,
        event_type: MessageEventType["message:delivered"],
        occurred_at: toClickHouseDateTime(new Date(payload.occurredAt)),
        inserted_at: toClickHouseDateTime(new Date()),
      }))

    await saveToClickhouse(insertedData)

    const updateItems: SequenceUpdateItem[] = sequenceSchedulePayloads.map(
      (p) => ({
        workspaceId: p.context.workspaceId,
        sequenceId: (p.metadata as { sequenceId: string }).sequenceId,
        stepId: (p.metadata as { sequenceStepId: string }).sequenceStepId,
        contactInboxId: (p.metadata as { contactInboxId: string })
          .contactInboxId,
        occurredAt: new Date(p.occurredAt),
      }),
    )

    await processSequenceEvents(updateItems, "deliveredAt")
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

      const sequenceDispatches = await db.query.sequenceDispatchModel.findMany({
        where: {
          workspaceId,
          contactInboxId: { in: contactInboxIds },
          status: { in: ["completed"] },
          seenAt: { isNull: true },
        },
      })

      if (sequenceDispatches.length === 0) {
        continue
      }

      const updateItems: SequenceUpdateItem[] = sequenceDispatches
        .map((s) => {
          const payload = mappedChatbotPayloads.get(s.contactInboxId)
          if (!payload) {
            return null
          }
          return {
            workspaceId,
            sequenceId: s.sequenceId,
            stepId: s.stepId,
            contactInboxId: s.contactInboxId,
            occurredAt: new Date(payload.occurredAt),
          }
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)

      await processSequenceEvents(updateItems, "seenAt")

      const insertedData: SequenceScheduleEventType[] = sequenceDispatches.map(
        (s) => {
          const occurredAt = toClickHouseDateTime(
            new Date(
              mappedChatbotPayloads.get(s.contactInboxId)?.occurredAt ||
                new Date(),
            ),
          )

          return {
            workspace_id: workspaceId,
            sequence_id: s.sequenceId,
            step_id: s.stepId,
            contact_inbox_id: s.contactInboxId,
            event_type: MessageEventType["message:seen"],
            occurred_at: occurredAt,
            inserted_at: toClickHouseDateTime(new Date()),
          }
        },
      )

      await saveToClickhouse(insertedData)
    }
  }

  async onClicked(payloads: SequenceSchemaPayload[]) {
    try {
      const sequenceClicks = payloads.filter((p) => p.action?.sequenceStepId)

      if (sequenceClicks.length === 0) {
        return
      }

      const sequenceStepIds = [
        ...new Set<string>(
          sequenceClicks
            .map((p) => p.action.sequenceStepId)
            .filter((id): id is string => id !== undefined),
        ),
      ]

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

      const insertedData: SequenceScheduleEventType[] = sequenceClicks.map(
        (payload) => ({
          workspace_id: payload.context.workspaceId,
          sequence_id:
            sequenceStepsMap.get(payload.action.sequenceStepId ?? "") ?? "",
          step_id: payload.action.sequenceStepId || "",
          contact_inbox_id: payload.context.contactInboxId ?? "",
          event_type: FlowEventType["flow:clicked"],
          occurred_at: toClickHouseDateTime(new Date(payload.occurredAt)),
          inserted_at: toClickHouseDateTime(new Date()),
        }),
      )

      await saveToClickhouse(insertedData)

      const updateItems: SequenceUpdateItem[] = sequenceClicks.map((p) => ({
        workspaceId: p.context.workspaceId,
        sequenceId: sequenceStepsMap.get(p.action.sequenceStepId ?? "") ?? "",
        stepId: p.action.sequenceStepId || "",
        contactInboxId: p.context.contactInboxId ?? "",
        occurredAt: new Date(p.occurredAt),
      }))
      await processSequenceEvents(updateItems, "clickedAt")
    } catch (error) {
      console.error("Failed to save clicked events", error)
    }
  }
}

export const sequenceAnalyticsService = new SequenceAnalyticsService()
